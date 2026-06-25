import SwiftUI
import AVFoundation
import Combine

// MARK: - 词牌模型（用于词汇表展示）
struct VocabWord: Identifiable, Hashable {
    let id = UUID()
    let word: String
    let seen: Int
    let correct: Int
    let masteryClass: String
}

/// 游戏 ViewModel：管理全部游戏状态和逻辑
@MainActor
final class GameViewModel: ObservableObject {
    // 牌堆 & 手牌
    @Published var bank: [String] = []
    @Published var hand: [String] = []
    @Published var sentence: [String] = []
    @Published var targetWords: [String] = []
    @Published var glossary: [String: GlossaryEntry] = [:]

    // 状态
    @Published var score = 0
    @Published var progress = 0
    @Published var level = 1
    @Published var isBusy = false
    @Published var isLoading = true

    // 反馈
    @Published var feedbackMessage = ""
    @Published var feedbackType = ""
    @Published var tipText = ""

    // 词汇表
    @Published var vocabWords: [VocabWord] = []
    @Published var showVocab = false

    // 计时
    private var roundStart: Double = 0
    private var actionLog: [WordAction] = []

    private let speaker = AVSpeechSynthesizer()
    private let handSize = 12
    private let handMax = 16
    private let okScore = 10
    private let badPenalty = 5

    // MARK: - 开始新游戏

    func start() async {
        score = 0; progress = 0; level = 1
        hand = []; sentence = []; bank = []; targetWords = []; glossary = [:]; actionLog = []
        feedbackMessage = ""; feedbackType = ""; tipText = ""
        isLoading = true
        await loadModel()
        await newRound()
    }

    private func loadModel() async {
        do {
            let model = try await APIService.shared.fetchModel()
            if let lv = model.level { level = lv }
            if let wf = model.wordFamiliarity {
                vocabWords = wf.map { w, f in
                    let acc = f.seen > 0 ? Double(f.correct ?? 0) / Double(f.seen) : 0
                    let avgT = f.seen > 0 ? Double(f.totalTime ?? 0) / Double(f.seen) : 99999
                    let cls: String
                    if acc >= 0.9 && avgT < 2000 { cls = "mastered" }
                    else if acc >= 0.7 { cls = "familiar" }
                    else { cls = "weak" }
                    return VocabWord(word: w, seen: f.seen, correct: f.correct ?? 0, masteryClass: cls)
                }.sorted { a, b in
                    let order = ["weak", "familiar", "mastered"]
                    let ai = order.firstIndex(of: a.masteryClass) ?? 2
                    let bi = order.firstIndex(of: b.masteryClass) ?? 2
                    return ai < bi
                }
            }
        } catch {}
    }

    // MARK: - 新一局

    private func newRound() async {
        do {
            let resp = try await APIService.shared.deal(score: score)
            bank = resp.pool
            targetWords = resp.targetWords
            glossary = resp.glossary
            if resp.level > 0 { level = resp.level }
            hand = []; sentence = []; progress = 0; actionLog = []
            var dealt = 0
            while dealt < handSize && !bank.isEmpty && hand.count < handMax {
                hand.append(bank.removeLast())
                dealt += 1
            }
            roundStart = CFAbsoluteTimeGetCurrent()
            tipText = "Tap the next word to build the sentence"
            feedbackMessage = ""; feedbackType = ""
        } catch {
            tipText = "Failed: \(error.localizedDescription)"
        }
        isLoading = false
    }

    // MARK: - 出牌

    func playTile(_ word: String) {
        guard !isBusy, progress < targetWords.count else { return }

        let now = CFAbsoluteTimeGetCurrent()
        let elapsed: Int
        if let last = actionLog.last {
            elapsed = Int((now - last.timestamp) * 1000)
        } else if roundStart > 0 {
            elapsed = Int((now - roundStart) * 1000)
        } else {
            elapsed = 1000
        }

        let expected = targetWords[progress]

        if word.lowercased() == expected.lowercased() {
            // 正确
            hand.removeAll { $0 == word }
            sentence.append(word)
            speakWord(word)
            progress += 1
            score += okScore
            actionLog.append(WordAction(word: word, correct: true, timeMs: elapsed, action: "play", timestamp: now))

            if progress >= targetWords.count {
                // 本句完成
                feedbackType = "ok"
                feedbackMessage = "Complete! +\(okScore)"
                Task {
                    await submitStats()
                    sentence = []; progress = 0
                    actionLog = []
                    roundStart = CFAbsoluteTimeGetCurrent()
                    await newRound()
                }
            } else {
                feedbackType = "ok"
                feedbackMessage = "+\(okScore)"
            }
        } else {
            // 错误
            score -= badPenalty
            actionLog.append(WordAction(word: word, correct: false, timeMs: elapsed, action: "play", timestamp: now))
            feedbackType = "bad"
            feedbackMessage = "Expected \"\(expected)\" -\(badPenalty)"
        }
    }

    // MARK: - 语句区移除词回手牌

    func removeFromSentence(_ word: String) {
        guard !isBusy else { return }
        guard let idx = sentence.firstIndex(of: word) else { return }
        sentence.remove(at: idx)
        hand.append(word)
        progress = sentence.count
        actionLog.append(WordAction(word: word, correct: false, timeMs: 0, action: "remove", timestamp: CFAbsoluteTimeGetCurrent()))
        feedbackMessage = ""; feedbackType = ""
    }

    // MARK: - 清空句子

    func clearSentence() {
        guard !isBusy else { return }
        hand.append(contentsOf: sentence)
        sentence.removeAll()
        progress = 0
        feedbackMessage = ""; feedbackType = ""
    }

    // MARK: - 摸牌

    func draw() {
        guard !bank.isEmpty, hand.count < handMax else {
            tipText = hand.count >= handMax ? "Hand full" : "Deck empty"
            return
        }
        hand.append(bank.removeLast())
    }

    // MARK: - 朗读

    func speakWord(_ word: String) {
        speaker.stopSpeaking(at: .immediate)
        let utterance = AVSpeechUtterance(string: word)
        utterance.voice = AVSpeechSynthesisVoice(language: "en-US")
        utterance.rate = AVSpeechUtteranceDefaultSpeechRate * 0.85
        speaker.speak(utterance)
    }

    // MARK: - 上报统计

    private func submitStats() async {
        guard !actionLog.isEmpty else { return }
        let total = actionLog.reduce(0) { $0 + $1.timeMs }
        let stats = StatsRequest(
            words: actionLog,
            totalTimeMs: total,
            score: score
        )
        do {
            let resp = try await APIService.shared.submitStats(stats)
            if let lv = resp.level { level = lv }
            await loadModel()
        } catch {}
    }
}

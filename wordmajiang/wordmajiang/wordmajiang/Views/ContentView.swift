import SwiftUI

struct ContentView: View {
    @StateObject private var vm = GameViewModel()

    var body: some View {
        VStack(spacing: 0) {
            // 顶栏
            HStack {
                Text("Vocab Builder")
                    .font(.system(size: 18, weight: .semibold))
                Text("Lv.\(vm.level)")
                    .font(.system(size: 11))
                    .padding(.horizontal, 6).padding(.vertical, 2)
                    .background(Color.green.opacity(0.2))
                    .clipShape(RoundedRectangle(cornerRadius: 4))
                Spacer()
                HStack(spacing: 14) {
                    StatLabel(title: "Score", value: "\(vm.score)")
                    StatLabel(title: "Hand", value: "\(vm.hand.count)")
                    StatLabel(title: "Deck", value: "\(vm.bank.count)")
                }
            }
            .padding(.horizontal, 16).padding(.vertical, 10)

            Divider()

            ScrollView {
                VStack(spacing: 12) {
                    // 目标句
                    if !vm.targetWords.isEmpty {
                        VStack(spacing: 4) {
                            Text("Target").font(.system(size: 11)).foregroundStyle(.tertiary)
                            Text(targetDisplay).font(.system(size: 14))
                        }
                        .padding(.vertical, 8).padding(.horizontal, 12)
                        .frame(maxWidth: .infinity)
                        .background(Color.white.opacity(0.04))
                        .clipShape(RoundedRectangle(cornerRadius: 6))
                    }

                    // 句子区
                    sectionBox("Your Sentence") {
                        if vm.sentence.isEmpty {
                            Text("Tap a word below to place it")
                                .font(.system(size: 13))
                                .foregroundStyle(.tertiary.opacity(0.5))
                                .padding(.vertical, 20)
                        } else {
                            FlowCards(items: vm.sentence, spacing: 4) { word in
                                WordTileView(word: word, glossary: vm.glossary[word.lowercased()], isInSentence: true,
                                    onTap: { vm.removeFromSentence(word) },
                                    onSpeak: { vm.speakWord(word) })
                            }
                        }
                    }

                    // 反馈
                    if !vm.feedbackMessage.isEmpty {
                        Text(vm.feedbackMessage)
                            .font(.system(size: 13))
                            .foregroundStyle(vm.feedbackType == "ok" ? .green : .red)
                    }

                    // 手牌
                    sectionBox("Your Hand") {
                        FlowCards(items: vm.hand, spacing: 6) { word in
                            WordTileView(word: word, glossary: vm.glossary[word.lowercased()], isInSentence: false,
                                onTap: { vm.playTile(word) },
                                onSpeak: { vm.speakWord(word) })
                        }
                    }

                    // 词汇表
                    if vm.showVocab {
                        sectionBox("Learned Words (\(vm.vocabWords.count))") {
                            FlowCards(items: vm.vocabWords, spacing: 4) { vw in
                                VStack(spacing: 1) {
                                    Text(vw.word).font(.system(size: 12, weight: .semibold))
                                    Text("\(vw.correct)/\(vw.seen)").font(.system(size: 9)).foregroundStyle(.secondary)
                                }
                                .padding(.horizontal, 8).padding(.vertical, 4)
                                .background(masteryColor(vw.masteryClass).opacity(0.15))
                                .clipShape(RoundedRectangle(cornerRadius: 4))
                            }
                        }
                    }

                    if !vm.tipText.isEmpty && vm.feedbackMessage.isEmpty {
                        Text(vm.tipText).font(.system(size: 12)).foregroundStyle(.tertiary)
                    }
                }
                .padding(12)
                .padding(.bottom, 60) // 留空间给底部按钮
            }

            // 底部固定操作栏
            Divider()
            HStack(spacing: 8) {
                Button("Clear") { vm.clearSentence() }.buttonStyle(.bordered)
                Button("Draw") { vm.draw() }.buttonStyle(.bordered)
                    .disabled(vm.bank.isEmpty || vm.hand.count >= 16)
                Button("New Game") { Task { await vm.start() } }.buttonStyle(.bordered)
                Button(vm.showVocab ? "Hide" : "Words") { vm.showVocab.toggle() }.buttonStyle(.bordered)
            }
            .padding(.horizontal, 16).padding(.vertical, 10)
            .background(.ultraThinMaterial)
        }
        .task { await vm.start() }
    }

    private var targetDisplay: AttributedString {
        var result = AttributedString()
        for (i, w) in vm.targetWords.enumerated() {
            var part = AttributedString(w + (i < vm.targetWords.count - 1 ? " " : ""))
            if i < vm.sentence.count {
                part.foregroundColor = .green
                part.font = .system(size: 14, weight: .bold)
            } else {
                part.foregroundColor = .secondary
            }
            result.append(part)
        }
        return result
    }

    private func masteryColor(_ cls: String) -> Color {
        switch cls {
        case "mastered": return .green
        case "familiar": return .blue
        default: return .red
        }
    }

    @ViewBuilder
    private func sectionBox<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(spacing: 4) {
            Text(title).font(.system(size: 11)).foregroundStyle(.tertiary)
            content()
        }
        .padding(12)
        .background(Color.white.opacity(0.03))
        .clipShape(RoundedRectangle(cornerRadius: 6))
    }
}

// MARK: - 辅助组件

struct StatLabel: View {
    let title: String; let value: String
    var body: some View {
        VStack(spacing: 1) {
            Text(value).font(.system(size: 15, weight: .bold))
            Text(title).font(.system(size: 10)).foregroundStyle(.secondary)
        }
    }
}

// MARK: - 瀑布流布局（iOS 14+）- LazyVGrid自适应列 + 左对齐

struct FlowCards<Data: RandomAccessCollection, Content: View>: View where Data.Element: Hashable {
    let items: Data
    let spacing: CGFloat
    @ViewBuilder let card: (Data.Element) -> Content

    var body: some View {
        LazyVGrid(
            columns: [GridItem(.adaptive(minimum: 90, maximum: 220), spacing: spacing, alignment: .leading)],
            alignment: .leading,
            spacing: spacing
        ) {
            ForEach(Array(items), id: \.self) { item in
                card(item)
            }
        }
    }
}

#Preview {
    ContentView()
        .preferredColorScheme(.dark)
}

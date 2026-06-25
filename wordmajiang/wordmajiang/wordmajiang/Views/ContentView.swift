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
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(Color.green.opacity(0.2))
                    .clipShape(RoundedRectangle(cornerRadius: 4))
                Spacer()
                HStack(spacing: 14) {
                    StatLabel(title: "Score", value: "\(vm.score)")
                    StatLabel(title: "Hand", value: "\(vm.hand.count)")
                    StatLabel(title: "Deck", value: "\(vm.bank.count)")
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 10)

            Divider()

            ScrollView {
                VStack(spacing: 12) {
                    // 目标句
                    if !vm.targetWords.isEmpty {
                        VStack(spacing: 4) {
                            Text("Target")
                                .font(.system(size: 11))
                                .foregroundStyle(.tertiary)
                            Text(targetDisplay)
                                .font(.system(size: 14))
                                .frame(maxWidth: .infinity, alignment: .center)
                        }
                        .padding(.vertical, 8)
                        .padding(.horizontal, 12)
                        .background(Color.white.opacity(0.04))
                        .clipShape(RoundedRectangle(cornerRadius: 6))
                    }

                    // 句子区
                    VStack(spacing: 4) {
                        Text("Your Sentence")
                            .font(.system(size: 11))
                            .foregroundStyle(.tertiary)
                        if vm.sentence.isEmpty {
                            Text("Tap a word below to place it")
                                .font(.system(size: 13))
                                .foregroundStyle(.tertiary.opacity(0.5))
                                .padding(.vertical, 20)
                        } else {
                            FlowLayout(spacing: 4) {
                                ForEach(vm.sentence, id: \.self) { word in
                                    WordTileView(
                                        word: word,
                                        glossary: vm.glossary[word.lowercased()],
                                        isInSentence: true,
                                        onTap: { vm.removeFromSentence(word) },
                                        onSpeak: { vm.speakWord(word) }
                                    )
                                }
                            }
                        }
                    }
                    .padding(12)
                    .background(Color.white.opacity(0.03))
                    .clipShape(RoundedRectangle(cornerRadius: 6))

                    // 反馈
                    if !vm.feedbackMessage.isEmpty {
                        Text(vm.feedbackMessage)
                            .font(.system(size: 13))
                            .foregroundStyle(vm.feedbackType == "ok" ? .green : .red)
                    }

                    // 手牌
                    VStack(spacing: 4) {
                        Text("Your Hand")
                            .font(.system(size: 11))
                            .foregroundStyle(.tertiary)
                        FlowLayout(spacing: 6) {
                            ForEach(vm.hand, id: \.self) { word in
                                WordTileView(
                                    word: word,
                                    glossary: vm.glossary[word.lowercased()],
                                    isInSentence: false,
                                    onTap: { vm.playTile(word) },
                                    onSpeak: { vm.speakWord(word) }
                                )
                            }
                        }
                    }
                    .padding(12)
                    .background(Color.white.opacity(0.03))
                    .clipShape(RoundedRectangle(cornerRadius: 6))

                    // 操作栏
                    HStack(spacing: 8) {
                        Button("Clear") { vm.clearSentence() }
                            .buttonStyle(.bordered)
                        Button("Draw") { vm.draw() }
                            .buttonStyle(.bordered)
                            .disabled(vm.bank.isEmpty || vm.hand.count >= 16)
                        Button("New Game") { Task { await vm.start() } }
                            .buttonStyle(.bordered)
                        Button(vm.showVocab ? "Hide Words" : "Word List") {
                            vm.showVocab.toggle()
                        }
                        .buttonStyle(.bordered)
                    }

                    // 词汇表
                    if vm.showVocab {
                        VStack(spacing: 4) {
                            Text("Learned Words (\(vm.vocabWords.count))")
                                .font(.system(size: 11))
                                .foregroundStyle(.tertiary)
                            FlowLayout(spacing: 4) {
                                ForEach(vm.vocabWords) { vw in
                                    VStack(spacing: 1) {
                                        Text(vw.word)
                                            .font(.system(size: 12, weight: .semibold))
                                        Text("\(vw.correct)/\(vw.seen)")
                                            .font(.system(size: 9))
                                            .foregroundStyle(.secondary)
                                    }
                                    .padding(.horizontal, 8)
                                    .padding(.vertical, 4)
                                    .background(masteryColor(vw.masteryClass).opacity(0.15))
                                    .clipShape(RoundedRectangle(cornerRadius: 4))
                                }
                            }
                        }
                        .padding(12)
                        .background(Color.white.opacity(0.03))
                        .clipShape(RoundedRectangle(cornerRadius: 6))
                    }

                    // 提示
                    if !vm.tipText.isEmpty && vm.feedbackMessage.isEmpty {
                        Text(vm.tipText)
                            .font(.system(size: 12))
                            .foregroundStyle(.tertiary)
                    }
                }
                .padding(12)
            }
        }
        .frame(minWidth: 360, minHeight: 500)
        .task {
            await vm.start()
        }
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
}

// MARK: - 小辅助组件

struct StatLabel: View {
    let title: String
    let value: String
    var body: some View {
        VStack(spacing: 1) {
            Text(value).font(.system(size: 15, weight: .bold))
            Text(title).font(.system(size: 10)).foregroundStyle(.secondary)
        }
    }
}

/// 流式布局（词牌自动换行）
struct FlowLayout: Layout {
    var spacing: CGFloat = 4

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let rows = computeRows(proposal: proposal, subviews: subviews)
        var height: CGFloat = 0
        for row in rows {
            let rowHeight = row.map { $0.sizeThatFits(.unspecified).height }.max() ?? 0
            height += rowHeight + spacing
        }
        return CGSize(width: proposal.width ?? 300, height: max(height - spacing, 0))
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let rows = computeRows(proposal: proposal, subviews: subviews)
        var y = bounds.minY
        for row in rows {
            let rowHeight = row.map { $0.sizeThatFits(.unspecified).height }.max() ?? 0
            var x = bounds.minX
            for subview in row {
                let size = subview.sizeThatFits(.unspecified)
                subview.place(at: CGPoint(x: x, y: y), proposal: .unspecified)
                x += size.width + spacing
            }
            y += rowHeight + spacing
        }
    }

    private func computeRows(proposal: ProposedViewSize, subviews: Subviews) -> [[Subviews.Element]] {
        let maxWidth = proposal.width ?? 300
        var rows: [[Subviews.Element]] = [[]]
        var currentRowWidth: CGFloat = 0
        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if !rows[rows.count - 1].isEmpty, currentRowWidth + size.width > maxWidth {
                rows.append([subview])
                currentRowWidth = size.width + spacing
            } else {
                rows[rows.count - 1].append(subview)
                currentRowWidth += size.width + spacing
            }
        }
        return rows
    }
}

#Preview {
    ContentView()
        .preferredColorScheme(.dark)
}

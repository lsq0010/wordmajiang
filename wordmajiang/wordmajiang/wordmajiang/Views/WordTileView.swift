import SwiftUI

/// 单个词牌组件：词 / 音标 / 翻译 / 注释 + 喇叭按钮
struct WordTileView: View {
    let word: String
    let glossary: GlossaryEntry?
    let isInSentence: Bool
    let onTap: () -> Void
    let onSpeak: () -> Void

    var body: some View {
        VStack(spacing: 2) {
            HStack(spacing: 3) {
                Text(word)
                    .font(.system(size: 15, weight: .bold))
                    .foregroundStyle(isInSentence ? Color.cyan.opacity(0.8) : .primary)
                Button {
                    onSpeak()
                } label: {
                    Image(systemName: "speaker.wave.2.fill")
                        .font(.system(size: 9))
                        .opacity(0.3)
                }
                .buttonStyle(.plain)
            }
            if let cn = glossary?.cn, !cn.isEmpty {
                Text(cn)
                    .font(.system(size: 11))
                    .foregroundStyle(isInSentence ? Color.green.opacity(0.7) : .secondary.opacity(0.8))
            }
            if let note = glossary?.note, !note.isEmpty {
                Text(note)
                    .font(.system(size: 9))
                    .foregroundStyle(.tertiary)
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 6)
        .background(isInSentence ? Color.blue.opacity(0.15) : Color.white.opacity(0.08))
        .clipShape(RoundedRectangle(cornerRadius: 6))
        .overlay(RoundedRectangle(cornerRadius: 6).stroke(Color.gray.opacity(0.3), lineWidth: 1))
        .onTapGesture { onTap() }
    }
}

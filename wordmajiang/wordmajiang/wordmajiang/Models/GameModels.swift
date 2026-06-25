import Foundation

// MARK: - API 响应模型

/// 发牌接口 /api/deal 返回
struct DealResponse: Codable {
    let pool: [String]
    let targetWords: [String]
    let glossary: [String: GlossaryEntry]
    let level: Int
    let reason: String?
}

struct GlossaryEntry: Codable {
    let cn: String?
    let ipa: String?
    let note: String?
}

/// 统计上报 /api/stats 请求体
struct StatsRequest: Codable {
    let words: [WordAction]
    let totalTimeMs: Int
    let score: Int
}

struct WordAction: Codable {
    let word: String
    let correct: Bool
    let timeMs: Int
    let action: String?
    let timestamp: Double
}

/// Stats 响应
struct StatsResponse: Codable {
    let level: Int?
    let totalSentences: Int?
}

/// 用户模型 /api/model 返回
struct ModelResponse: Codable {
    let level: Int?
    let totalSentences: Int?
    let totalScore: Int?
    let wordFamiliarity: [String: WordFamiliarity]?
}

struct WordFamiliarity: Codable {
    let seen: Int
    let correct: Int?
    let wrong: Int?
    let removed: Int?
    let totalTime: Int?
}

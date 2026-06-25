import Foundation

/// 后端 API 服务（指向 Node.js 服务器）
final class APIService {
    static let shared = APIService()

    #if targetEnvironment(simulator)
    private let baseURL = "http://localhost:3000"
    #else
    private let baseURL = "http://localhost:3000" // 真机需改为局域网 IP
    #endif

    private let decoder: JSONDecoder = {
        let d = JSONDecoder()
        d.keyDecodingStrategy = .useDefaultKeys
        return d
    }()

    private let encoder: JSONEncoder = {
        let e = JSONEncoder()
        return e
    }()

    /// 请求新一局牌局
    func deal(score: Int) async throws -> DealResponse {
        let url = URL(string: "\(baseURL)/api/deal")!
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try encoder.encode(["score": score])

        let (data, _) = try await URLSession.shared.data(for: req)
        return try decoder.decode(DealResponse.self, from: data)
    }

    /// 上报答题统计
    func submitStats(_ stats: StatsRequest) async throws -> StatsResponse {
        let url = URL(string: "\(baseURL)/api/stats")!
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try encoder.encode(stats)

        let (data, _) = try await URLSession.shared.data(for: req)
        return try decoder.decode(StatsResponse.self, from: data)
    }

    /// 获取用户模型
    func fetchModel() async throws -> ModelResponse {
        let url = URL(string: "\(baseURL)/api/model")!
        let (data, _) = try await URLSession.shared.data(for: URLRequest(url: url))
        return try decoder.decode(ModelResponse.self, from: data)
    }
}

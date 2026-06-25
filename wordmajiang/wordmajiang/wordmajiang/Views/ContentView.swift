import SwiftUI
import WebKit

struct ContentView: View {
    var body: some View {
        WebViewWrapper()
            .ignoresSafeArea()
    }
}

struct WebViewWrapper: UIViewRepresentable {
    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        let webView = WKWebView(frame: .zero, configuration: config)
        webView.isOpaque = false
        webView.backgroundColor = UIColor(red: 0.1, green: 0.1, blue: 0.1, alpha: 1)
        webView.scrollView.backgroundColor = UIColor(red: 0.1, green: 0.1, blue: 0.1, alpha: 1)

        #if targetEnvironment(simulator)
        let url = URL(string: "http://localhost:3000")!
        #else
        let url = URL(string: "http://172.17.38.29:3000")!
        #endif
        webView.load(URLRequest(url: url))
        return webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}
}

#Preview {
    ContentView()
}

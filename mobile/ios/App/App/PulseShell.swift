import UIKit
import Capacitor

enum ServerStore {
    private static let urlKey = "pulse.serverURL"
    private static let pickKey = "pulse.showPicker"
    // Sign-in hosts a Pulse server may sit behind; every other host opens in the browser.
    static let authHosts = ["*.cloudflareaccess.com"]
    static let changeServerShortcut = "io.github.adityaongit.pulse.change-server"

    static var url: String? { UserDefaults.standard.string(forKey: urlKey) }

    static func save(_ origin: String) {
        UserDefaults.standard.set(origin, forKey: urlKey)
        UserDefaults.standard.removeObject(forKey: pickKey)
    }

    static func requestPicker() {
        UserDefaults.standard.set(true, forKey: pickKey)
    }

    static func consumePicker() -> Bool {
        let pick = UserDefaults.standard.bool(forKey: pickKey)
        if pick { UserDefaults.standard.removeObject(forKey: pickKey) }
        return pick
    }

    static func origin(_ raw: String?) -> String? {
        guard let raw, let components = URLComponents(string: raw.trimmingCharacters(in: .whitespaces)),
              components.scheme?.lowercased() == "https", let host = components.host, !host.isEmpty else { return nil }
        return "https://\(host.lowercased())" + (components.port.map { ":\($0)" } ?? "")
    }
}

class MainViewController: CAPBridgeViewController {
    override open func instanceDescriptor() -> InstanceDescriptor {
        let descriptor = super.instanceDescriptor()
        if !ServerStore.consumePicker(), let url = ServerStore.url {
            descriptor.serverURL = url
            descriptor.allowedNavigationHostnames = ServerStore.authHosts
        }
        return descriptor
    }

    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(PulseServerPlugin())
    }

    static func reload(in window: UIWindow?) {
        window?.rootViewController = MainViewController()
    }
}

@objc(PulseServerPlugin)
public class PulseServerPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "PulseServerPlugin"
    public let jsName = "PulseServer"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "get", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "set", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "pick", returnType: CAPPluginReturnPromise)
    ]

    @objc func get(_ call: CAPPluginCall) {
        var result: [String: Any] = [:]
        if let url = ServerStore.url { result["url"] = url }
        call.resolve(result)
    }

    @objc func set(_ call: CAPPluginCall) {
        guard let origin = ServerStore.origin(call.getString("url")) else {
            call.reject("Use an https:// address.")
            return
        }
        ServerStore.save(origin)
        call.resolve()
        restart()
    }

    @objc func pick(_ call: CAPPluginCall) {
        ServerStore.requestPicker()
        call.resolve()
        restart()
    }

    private func restart() {
        DispatchQueue.main.async { [weak self] in
            MainViewController.reload(in: self?.bridge?.viewController?.view.window)
        }
    }
}

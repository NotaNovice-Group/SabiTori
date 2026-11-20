import UIKit
import Capacitor

/// The app's web view controller: registers the project's own iOS plugins (they live in the app target,
/// not in a Swift package, so Capacitor does not find them by itself).
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(SabiToriVisionPlugin())
        bridge?.registerPluginInstance(SabiToriKokoroPlugin())
    }
}

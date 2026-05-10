import Cocoa
import SafariServices

class ViewController: NSViewController {

    private let extensionBundleIdentifier = "com.howardajacobson.window-manager.extension"

    override func loadView() {
        let stack = NSStackView()
        stack.orientation = .vertical
        stack.alignment = .centerX
        stack.spacing = 16
        stack.edgeInsets = NSEdgeInsets(top: 32, left: 32, bottom: 32, right: 32)

        let icon = NSImageView()
        icon.image = NSImage(systemSymbolName: "macwindow.on.rectangle", accessibilityDescription: nil)
        icon.contentTintColor = .controlAccentColor
        icon.widthAnchor.constraint(equalToConstant: 48).isActive = true
        icon.heightAnchor.constraint(equalToConstant: 48).isActive = true

        let title = NSTextField(labelWithString: "Window Manager")
        title.font = .systemFont(ofSize: 20, weight: .semibold)

        let subtitle = NSTextField(wrappingLabelWithString:
            "To use this extension, enable it in Safari.\nGo to Safari → Settings → Extensions → Window Manager.")
        subtitle.alignment = .center
        subtitle.textColor = .secondaryLabelColor
        subtitle.font = .systemFont(ofSize: 13)

        let button = NSButton(title: "Open Safari Extensions Preferences…", target: self, action: #selector(openSafariExtensionPreferences))
        button.bezelStyle = .rounded
        button.controlSize = .large
        button.keyEquivalent = "\r"

        stack.addArrangedSubview(icon)
        stack.addArrangedSubview(title)
        stack.addArrangedSubview(subtitle)
        stack.addArrangedSubview(button)

        self.view = stack
    }

    @objc func openSafariExtensionPreferences() {
        SFSafariApplication.showPreferencesForExtension(withIdentifier: extensionBundleIdentifier) { error in
            if let error {
                DispatchQueue.main.async {
                    NSApp.presentError(error)
                }
            }
        }
    }
}

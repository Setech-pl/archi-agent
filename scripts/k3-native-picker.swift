// macOS Accessibility controls for the synthetic VS Code PID only.
import AppKit
import ApplicationServices

let pid = pid_t(CommandLine.arguments[1])!
let destination = CommandLine.arguments[2]
let app = AXUIElementCreateApplication(pid)
func attribute(_ element: AXUIElement, _ name: String) -> AnyObject? {
    var value: CFTypeRef?
    guard AXUIElementCopyAttributeValue(element, name as CFString, &value) == .success else { return nil }
    return value
}
func tree(_ element: AXUIElement, depth: Int = 0) -> [AXUIElement] {
    guard depth < 25 else { return [] }
    let role = attribute(element, kAXRoleAttribute) as? String
    if role == kAXMenuBarRole || role == kAXMenuRole { return [] }
    let children = role == kAXApplicationRole ? (attribute(element, kAXWindowsAttribute) as? [AXUIElement] ?? []) : (attribute(element, kAXChildrenAttribute) as? [AXUIElement] ?? [])
    return [element] + children.flatMap { tree($0, depth: depth + 1) }
}
func wait(_ label: String, _ find: () -> AXUIElement?) -> AXUIElement {
    for _ in 0..<100 {
        if let element = find() { return element }
        RunLoop.current.run(until: Date(timeIntervalSinceNow: 0.1))
    }
    let controls = tree(app).map { "\(attribute($0, kAXRoleAttribute) ?? "?" as NSString):focused=\(attribute($0, kAXFocusedAttribute) ?? "" as NSString)" }.joined(separator: "; ")
    fputs("Native picker unavailable: \(label); controls: \(controls)\n", stderr)
    exit(1)
}
func key(_ code: CGKeyCode, _ flags: CGEventFlags = []) {
    // Another desktop app can take focus while the native sheet is being located.
    // Recover the synthetic PID and verify it before sending any global keystroke.
    if attribute(app, kAXFrontmostAttribute) as? Bool != true {
        NSRunningApplication(processIdentifier: pid)?.activate(options: [.activateAllWindows])
        AXUIElementSetAttributeValue(app, kAXFrontmostAttribute as CFString, kCFBooleanTrue)
        for _ in 0..<30 {
            if attribute(app, kAXFrontmostAttribute) as? Bool == true { break }
            RunLoop.current.run(until: Date(timeIntervalSinceNow: 0.1))
        }
    }
    guard attribute(app, kAXFrontmostAttribute) as? Bool == true else {
        fputs("Synthetic VS Code lost native focus\n", stderr)
        exit(1)
    }
    for down in [true, false] {
        let event = CGEvent(keyboardEventSource: nil, virtualKey: code, keyDown: down)!
        event.flags = flags
        event.post(tap: .cghidEventTap)
    }
}
guard AXIsProcessTrusted() else {
    fputs("macOS Accessibility is unavailable for Swift native picker helper\n", stderr)
    exit(1)
}
NSRunningApplication(processIdentifier: pid)?.activate(options: [])
AXUIElementSetAttributeValue(app, kAXFrontmostAttribute as CFString, kCFBooleanTrue)
for _ in 0..<50 {
    if attribute(app, kAXFrontmostAttribute) as? Bool == true { break }
    RunLoop.current.run(until: Date(timeIntervalSinceNow: 0.1))
}
_ = wait("sheet on synthetic VS Code PID") { tree(app).first { attribute($0, kAXRoleAttribute) as? String == kAXSheetRole } }
key(5, [.maskCommand, .maskShift]) // G: native Go to Folder
let field = wait("focused Go to Folder text field") {
    tree(app).first { attribute($0, kAXRoleAttribute) as? String == kAXTextFieldRole && attribute($0, kAXFocusedAttribute) as? Bool == true }
}
guard AXUIElementSetAttributeValue(field, kAXValueAttribute as CFString, destination as CFString) == .success,
      attribute(field, kAXValueAttribute) as? String == destination else {
    fputs("Native path field did not accept the synthetic path\n", stderr)
    exit(1)
}
key(36)
let button = wait("enabled Use Knowledge Pack button") {
    tree(app).first {
        attribute($0, kAXRoleAttribute) as? String == kAXButtonRole &&
        ["Use documents", "Choose parent folder", "Use Knowledge Pack", "Open", "Otwórz", "Select Folder"].contains(attribute($0, kAXTitleAttribute) as? String ?? "") &&
        attribute($0, kAXEnabledAttribute) as? Bool == true &&
        !tree(app).contains { attribute($0, kAXRoleAttribute) as? String == kAXTextFieldRole && attribute($0, kAXFocusedAttribute) as? Bool == true }
    }
}
guard AXUIElementPerformAction(button, kAXPressAction as CFString) == .success else {
    fputs("Native Open button press failed\n", stderr)
    exit(1)
}
print("AXSheet on PID \(pid); native path field verified; AXPress Open")

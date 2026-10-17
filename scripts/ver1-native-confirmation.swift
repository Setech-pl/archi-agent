import AppKit
import ApplicationServices
import Foundation
let pid = pid_t(CommandLine.arguments[1])!
let app = AXUIElementCreateApplication(pid)
func attr(_ element: AXUIElement, _ name: String) -> AnyObject? {
    var value: CFTypeRef?
    guard AXUIElementCopyAttributeValue(element, name as CFString, &value) == .success else { return nil }
    return value
}
func tree(_ element: AXUIElement, _ depth: Int = 0) -> [AXUIElement] {
    guard depth < 25 else { return [] }
    let role = attr(element, kAXRoleAttribute) as? String
    if role == kAXMenuBarRole || role == kAXMenuRole { return [] }
    let children = role == kAXApplicationRole ? (attr(element, kAXWindowsAttribute) as? [AXUIElement] ?? []) : (attr(element, kAXChildrenAttribute) as? [AXUIElement] ?? [])
    return [element] + children.flatMap { tree($0, depth + 1) }
}
guard AXIsProcessTrusted() else { fputs("Accessibility unavailable\n", stderr); exit(1) }
NSRunningApplication(processIdentifier: pid)?.activate(options: [])
for _ in 0..<150 {
    let nodes = tree(app)
    let confirmed = nodes.contains { ((attr($0, kAXValueAttribute) as? String) ?? (attr($0, kAXTitleAttribute) as? String) ?? "").contains("save the confirmed aliases to this source overlay?") }
    if confirmed, let button = nodes.first(where: { attr($0, kAXRoleAttribute) as? String == kAXButtonRole && attr($0, kAXTitleAttribute) as? String == "Save aliases" }) {
        guard AXUIElementPerformAction(button, kAXPressAction as CFString) == .success else { exit(1) }
        print("Native alias confirmation pressed for PID \(pid)")
        exit(0)
    }
    RunLoop.current.run(until: Date(timeIntervalSinceNow: 0.1))
}
fputs("Native alias confirmation unavailable\n", stderr)
exit(1)

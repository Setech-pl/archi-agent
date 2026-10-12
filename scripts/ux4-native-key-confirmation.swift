import AppKit
import ApplicationServices
import Foundation
let pid = pid_t(CommandLine.arguments[1])!
let action = CommandLine.arguments[2]
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
guard AXIsProcessTrusted() else { fputs("Accessibility unavailable\n", stderr); exit(1) }
NSRunningApplication(processIdentifier: pid)?.activate(options: [])
for _ in 0..<150 {
    // Scope actions to the smallest native container with the exact confirmation text.
    // The underlying generation notification can expose a button with the same title.
    let containers = tree(app).map { tree($0) }.filter { nodes in
        nodes.contains { attribute($0, kAXRoleAttribute) as? String == kAXStaticTextRole &&
            ((attribute($0, kAXValueAttribute) as? String) ?? "").contains("delete the saved API key for") } &&
        nodes.contains { attribute($0, kAXRoleAttribute) as? String == kAXButtonRole && attribute($0, kAXTitleAttribute) as? String == "Delete API Key" }
    }
    let elements = containers.min { $0.count < $1.count } ?? []
    let save = elements.first { attribute($0, kAXRoleAttribute) as? String == kAXButtonRole && attribute($0, kAXTitleAttribute) as? String == "Delete API Key" }
    if save != nil {
        let texts = elements.filter { attribute($0, kAXRoleAttribute) as? String == kAXStaticTextRole }.compactMap { (attribute($0, kAXValueAttribute) as? String) ?? (attribute($0, kAXTitleAttribute) as? String) }
        if texts.contains(where: { $0.contains("delete the saved API key for") }) {
            let payload: [String: Any] = ["pid": pid, "texts": texts, "action": action]
            let data = try! JSONSerialization.data(withJSONObject: payload)
            print(String(data: data, encoding: .utf8)!)
            if action != "inspect" {
                guard let button = elements.first(where: { attribute($0, kAXRoleAttribute) as? String == kAXButtonRole && attribute($0, kAXTitleAttribute) as? String == action }),
                      AXUIElementPerformAction(button, kAXPressAction as CFString) == .success else { fputs("Confirmation button unavailable\n", stderr); exit(1) }
            }
            exit(0)
        }
    }
    RunLoop.current.run(until: Date(timeIntervalSinceNow: 0.1))
}
fputs("Native API key deletion confirmation unavailable\n", stderr)
exit(1)

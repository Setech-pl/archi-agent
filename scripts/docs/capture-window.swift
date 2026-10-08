// DOC1: resize/foreground ONLY the isolated harness PID; return its capture rectangle.
import AppKit
import ApplicationServices
import Foundation
let pid = pid_t(CommandLine.arguments[1])!
guard AXIsProcessTrusted() else { fputs("Accessibility unavailable\n", stderr); exit(1) }
guard let running = NSRunningApplication(processIdentifier: pid) else { fputs("Running application unavailable\n", stderr); exit(1) }
running.activate(options: [])
let app = AXUIElementCreateApplication(pid)
var value: CFTypeRef?
for _ in 0..<100 {
    AXUIElementCopyAttributeValue(app, kAXWindowsAttribute as CFString, &value)
    if let windows = value as? [AXUIElement], !windows.isEmpty { break }
    RunLoop.current.run(until: Date(timeIntervalSinceNow: 0.1))
}
guard let windows = value as? [AXUIElement], let window = windows.first else { fputs("AX windows unavailable\n", stderr); exit(1) }
var position = CGPoint(x: 80, y: 80), size = CGSize(width: 1120, height: 760)
AXUIElementSetAttributeValue(window, kAXPositionAttribute as CFString, AXValueCreate(.cgPoint, &position)!)
AXUIElementSetAttributeValue(window, kAXSizeAttribute as CFString, AXValueCreate(.cgSize, &size)!)
Thread.sleep(forTimeInterval: 0.5)
var p: CFTypeRef?, s: CFTypeRef?
AXUIElementCopyAttributeValue(window, kAXPositionAttribute as CFString, &p)
AXUIElementCopyAttributeValue(window, kAXSizeAttribute as CFString, &s)
AXValueGetValue(p as! AXValue, .cgPoint, &position)
AXValueGetValue(s as! AXValue, .cgSize, &size)

let list = CGWindowListCopyWindowInfo([.optionAll, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] ?? []
let own = list.filter { ($0[kCGWindowOwnerPID as String] as? Int) == Int(pid) && ($0[kCGWindowLayer as String] as? Int) == 0 }
let main = own.max { a,b in
 let x = a[kCGWindowBounds as String] as? [String: Double] ?? [:], y = b[kCGWindowBounds as String] as? [String: Double] ?? [:]
 return (x["Width"] ?? 0)*(x["Height"] ?? 0) < (y["Width"] ?? 0)*(y["Height"] ?? 0)
}
guard let id = main?[kCGWindowNumber as String] as? Int else { fputs("Owned window unavailable\n",stderr);exit(1) }
print(id)

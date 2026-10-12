// Capture only windows owned by the isolated VS Code PID, even if another app is in front.
import AppKit
import ScreenCaptureKit
import Foundation
import Darwin
_ = NSApplication.shared
let pid = pid_t(CommandLine.arguments[1])!
let output = URL(fileURLWithPath: CommandLine.arguments[2], isDirectory: true)
let stop = URL(fileURLWithPath: CommandLine.arguments[3])
struct Frame: Codable { let file: String; let seconds: Double; let windowID: UInt32 }
func run() async throws {
    var frames: [Frame] = []
    var consecutiveCaptureFailures = 0
    let start = Date()
    while !FileManager.default.fileExists(atPath: stop.path) {
        let before = Date()
        if let app = NSRunningApplication(processIdentifier: pid), !app.isActive {
            app.activate(options: [.activateAllWindows])
        }
        let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: false)
        let owned = content.windows.filter { $0.owningApplication?.processID == pid && $0.frame.width > 700 && $0.frame.height > 500 }
        guard let window = owned.max(by: { $0.frame.width * $0.frame.height < $1.frame.width * $1.frame.height }) else { throw NSError(domain: "owned-window-unavailable", code: 1) }
        let config = SCStreamConfiguration()
        config.width = Int(window.frame.width)
        config.height = Int(window.frame.height)
        config.showsCursor = false
        config.ignoreShadowsSingleWindow = true
        let filter = SCContentFilter(desktopIndependentWindow: window)
        let image: CGImage
        do {
            image = try await SCScreenshotManager.captureImage(contentFilter: filter, configuration: config)
            consecutiveCaptureFailures = 0
        } catch {
            let failure = error as NSError
            consecutiveCaptureFailures += 1
            guard failure.domain == "com.apple.ScreenCaptureKit.SCStreamErrorDomain", failure.code == -3811, consecutiveCaptureFailures <= 3 else { throw error }
            fputs("Transient scoped capture failure, retrying the same owned window\n", stderr)
            try await Task.sleep(nanoseconds: 500_000_000)
            continue
        }
        let rep = NSBitmapImageRep(cgImage: image)
        guard let png = rep.representation(using: .png, properties: [:]) else { throw NSError(domain: "png-encode", code: 1) }
        let name = String(format: "%05d.png", frames.count)
        try png.write(to: output.appendingPathComponent(name))
        frames.append(Frame(file: name, seconds: before.timeIntervalSince(start), windowID: window.windowID))
        try await Task.sleep(nanoseconds: UInt64(max(0, 0.5 - Date().timeIntervalSince(before)) * 1_000_000_000))
    }
    let payload = try JSONEncoder().encode(frames)
    try payload.write(to: output.appendingPathComponent("frames.json"))
}
Task { do { try await run(); exit(0) } catch { fputs("Scoped capture failed: \(error)\n", stderr); exit(1) } }
dispatchMain()

// Identify actual native file-picker frames locally. Output filenames only, never OCR text.
import AppKit
import Vision
import Foundation
let folder = URL(fileURLWithPath: CommandLine.arguments[1], isDirectory: true)
var matches: [String] = []
for file in try FileManager.default.contentsOfDirectory(at: folder, includingPropertiesForKeys: nil).filter({ $0.pathExtension == "png" }).sorted(by: { $0.lastPathComponent < $1.lastPathComponent }) {
    let image = NSImage(contentsOf: file)!
    var rect = CGRect(origin: .zero, size: image.size)
    let cg = image.cgImage(forProposedRect: &rect, context: nil, hints: nil)!
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.recognitionLanguages = ["pl-PL", "en-US"]
    try VNImageRequestHandler(cgImage: cg).perform([request])
    let texts = (request.results ?? []).compactMap { $0.topCandidates(1).first?.string }
    if texts.contains(where: { $0 == "Ulubione" || $0 == "Favorites" }) && texts.contains(where: { $0.contains("Anuluj") || $0 == "Cancel" }) { matches.append(file.lastPathComponent) }
}
print(String(data: try JSONEncoder().encode(matches), encoding: .utf8)!)

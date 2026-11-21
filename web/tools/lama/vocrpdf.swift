// OCR Arab dengan Apple Vision (macOS). Bina: swiftc -O vocrpdf.swift -o vocrpdf
// Guna: vocrpdf <pdf> <mula> <akhir> [dpi]      (halaman PDF 1-based)
//       vocrpdf <pdf> list 12,40,501 [dpi]
// Output: JSON Lines {"pdf": N, "lines": [{t,c,x0,x1,y0,y1}]} ke stdout
import Foundation
import PDFKit
import Vision
import CoreGraphics

let args = CommandLine.arguments
guard let doc = PDFDocument(url: URL(fileURLWithPath: args[1])) else { exit(1) }
let pageList: [Int] = args[2] == "list" ? args[3].split(separator: ",").map { Int($0)! } : Array(Int(args[2])!...min(Int(args[3])!, doc.pageCount))
let dpi = args.count > 4 ? Double(args[4])! : 300.0
let scale = CGFloat(dpi / 72.0)
for n in pageList {
  autoreleasepool {
    guard let page = doc.page(at: n - 1) else { return }
    let box = page.bounds(for: .mediaBox)
    let w = Int(box.width * scale), h = Int(box.height * scale)
    let cs = CGColorSpaceCreateDeviceGray()
    guard let ctx = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: 0, space: cs, bitmapInfo: CGImageAlphaInfo.none.rawValue) else { return }
    ctx.setFillColor(gray: 1, alpha: 1); ctx.fill(CGRect(x: 0, y: 0, width: w, height: h))
    ctx.scaleBy(x: scale, y: scale)
    page.draw(with: .mediaBox, to: ctx)
    guard let cg = ctx.makeImage() else { return }
    let req = VNRecognizeTextRequest()
    req.recognitionLevel = .accurate
    req.recognitionLanguages = ["ar"]
    req.usesLanguageCorrection = true
    try? VNImageRequestHandler(cgImage: cg).perform([req])
    var lines: [[String: Any]] = []
    for o in req.results ?? [] {
      guard let c = o.topCandidates(1).first else { continue }
      let b = o.boundingBox
      lines.append(["t": c.string, "c": Double(c.confidence), "x0": Double(b.minX), "x1": Double(b.maxX), "y0": Double(b.minY), "y1": Double(b.maxY)])
    }
    let obj: [String: Any] = ["pdf": n, "lines": lines]
    if let d = try? JSONSerialization.data(withJSONObject: obj), let s = String(data: d, encoding: .utf8) { print(s); fflush(stdout) }
  }
}

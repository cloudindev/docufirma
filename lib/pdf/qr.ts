import QRCode from "qrcode";

export async function qrPng(text: string): Promise<Uint8Array> {
  return QRCode.toBuffer(text, {
    type: "png",
    errorCorrectionLevel: "M",
    margin: 1,
    width: 360,
    color: { dark: "#0B1B3F", light: "#FFFFFF" },
  });
}

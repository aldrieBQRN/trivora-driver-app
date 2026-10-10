import React, { useMemo } from 'react';
import { View, StyleSheet, Platform, ViewStyle, Linking } from 'react-native';
import Svg, { Rect, Path } from 'react-native-svg';
import QRCode from 'qrcode';
import { jsPDF } from 'jspdf';

interface DriverQrCodeViewProps {
  value: string;
  size?: number;
  style?: ViewStyle;
  title?: string;
}

export interface QrPdfOptions {
  stickerNumber?: string;
  plateNumber?: string;
  capacity?: number | null;
  filename?: string;
}

/**
 * High-performance vector QR code component using react-native-svg and qrcode.
 * Renders crisp vector modules identically across Web, Android, and iOS.
 */
export default function DriverQrCodeView({
  value,
  size = 180,
  style,
  title = 'Scan to Ride QR Code',
}: DriverQrCodeViewProps) {
  const { pathData, totalSize } = useMemo(() => {
    if (!value) return { pathData: '', totalSize: 0 };
    try {
      const qr = QRCode.create(value, { errorCorrectionLevel: 'M' });
      const moduleCount = qr.modules.size;
      const margin = 2;
      const total = moduleCount + margin * 2;
      let d = '';

      for (let r = 0; r < moduleCount; r++) {
        for (let c = 0; c < moduleCount; c++) {
          if (qr.modules.get(r, c)) {
            d += `M${c + margin},${r + margin}h1v1h-1z`;
          }
        }
      }

      return { pathData: d, totalSize: total };
    } catch {
      return { pathData: '', totalSize: 0 };
    }
  }, [value]);

  if (!value || !pathData) {
    return null;
  }

  return (
    <View style={[styles.container, { width: size, height: size }, style]} accessibilityLabel={title}>
      <Svg width={size} height={size} viewBox={`0 0 ${totalSize} ${totalSize}`}>
        <Rect width={totalSize} height={totalSize} fill="#FFFFFF" rx={1} />
        <Path d={pathData} fill="#0F172A" />
      </Svg>
    </View>
  );
}

/**
 * Downloads the QR code as a high-resolution PNG image (1200px width).
 * On Web: generates a PNG data URL and triggers browser download.
 * On Native: opens the image/print link in the browser.
 */
export async function downloadQrImage(qrUrl: string, filename: string = 'trivora-scan-to-ride.png'): Promise<void> {
  if (!qrUrl) return;

  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    const dataUrl = await QRCode.toDataURL(qrUrl, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 1200,
    });
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
  } else {
    // Native fallback: open the print sheet URL which provides PNG and PDF actions
    await Linking.openURL(qrUrl);
  }
}

/**
 * Generates and directly downloads the A6 printable "Scan to Ride" sheet as a PDF.
 * On Web: generates an A6 PDF document via jsPDF and triggers direct browser download (matching image download behavior).
 * On Native: opens the QR URL fallback.
 */
export async function downloadQrPdf(
  qrUrl: string,
  options: QrPdfOptions = {}
): Promise<void> {
  if (!qrUrl) return;

  const {
    stickerNumber,
    plateNumber,
    capacity,
    filename = 'trivora-scan-to-ride.pdf',
  } = options;

  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a6', // 105mm x 148mm standard A6 portrait
    });

    const centerX = 105 / 2;

    // Header Branding
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(29, 37, 66); // #1D2542
    doc.text('TRIVORA', centerX, 16, { align: 'center' });

    doc.setFontSize(18);
    doc.setTextColor(15, 23, 42); // #0F172A
    doc.text('SCAN TO RIDE', centerX, 25, { align: 'center' });

    // Subtle QR Code Container
    doc.setDrawColor(226, 232, 240); // #E2E8F0
    doc.setLineWidth(0.4);
    doc.roundedRect(20.5, 31, 64, 64, 3, 3, 'S');

    // High-resolution QR Code
    const qrDataUrl = await QRCode.toDataURL(qrUrl, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 600,
    });
    doc.addImage(qrDataUrl, 'PNG', 22.5, 33, 60, 60);

    // Passenger Instructions
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139); // #64748B
    doc.text('Scan to enter your destination', centerX, 103, { align: 'center' });
    doc.text("and join this tricycle's ride.", centerX, 107.5, { align: 'center' });

    // Divider Line
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.4);
    doc.line(14, 114, 91, 114);

    // Vehicle Specifications (Sticker Number & Plate Number)
    const col1X = 33;
    const col2X = 72;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(100, 116, 139);
    doc.text('STICKER NUMBER', col1X, 120, { align: 'center' });
    doc.text('PLATE NUMBER', col2X, 120, { align: 'center' });

    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    const formattedSticker = stickerNumber
      ? (stickerNumber.startsWith('#') ? stickerNumber : `#${stickerNumber}`)
      : '—';
    doc.text(formattedSticker, col1X, 126, { align: 'center' });
    doc.text(plateNumber || '—', col2X, 126, { align: 'center' });

    // Authorized Capacity
    if (capacity != null && capacity > 0) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(100, 116, 139);
      doc.text(`Authorized Capacity: ${capacity} Passengers`, centerX, 136, { align: 'center' });
    }

    // Direct download without navigating or opening print modal
    doc.save(filename);
  } else {
    // Native fallback
    await Linking.openURL(qrUrl);
  }
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

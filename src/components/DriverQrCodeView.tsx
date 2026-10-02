import React, { useMemo } from 'react';
import { View, StyleSheet, Platform, ViewStyle, Linking } from 'react-native';
import Svg, { Rect, Path } from 'react-native-svg';
import QRCode from 'qrcode';

interface DriverQrCodeViewProps {
  value: string;
  size?: number;
  style?: ViewStyle;
  title?: string;
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
 * Downloads / opens the A6 printable "Scan to Ride" sheet as a PDF.
 * On Web: opens the printable sheet with auto-print triggered.
 * On Native: opens the printable sheet in the system browser where it can be printed or saved as PDF.
 */
export async function downloadQrPdf(printUrl?: string): Promise<void> {
  if (!printUrl) return;
  const targetUrl = printUrl.includes('?') ? `${printUrl}&print=1` : `${printUrl}?print=1`;

  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.open(targetUrl, '_blank');
  } else {
    await Linking.openURL(targetUrl);
  }
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

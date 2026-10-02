import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { COLORS, RADIUS, SHADOWS, SPACING, TYPOGRAPHY } from '../constants/theme';
import { useDriverAuth } from '../context/DriverAuthContext';
import { DriverQrCodeData } from '../types';
import {
  QrCode,
  Download,
  Printer,
  Info,
  ShieldCheck,
  AlertTriangle,
} from 'lucide-react-native';
import ScreenHeader from '../components/ScreenHeader';
import StatusBadge from '../components/StatusBadge';
import Button from '../components/Button';
import DriverQrCodeView, { downloadQrImage, downloadQrPdf } from '../components/DriverQrCodeView';
import { useToast } from '../components/Toast';
import { driverApi } from '../services/api';

interface DriverQrCodeScreenProps {
  onBack: () => void;
}

export default function DriverQrCodeScreen({ onBack }: DriverQrCodeScreenProps) {
  const { showToast } = useToast();
  const { driver, refreshProfile } = useDriverAuth();
  const [qrData, setQrData] = useState<DriverQrCodeData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [downloadingImage, setDownloadingImage] = useState<boolean>(false);
  const [downloadingPdf, setDownloadingPdf] = useState<boolean>(false);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    refreshProfile();
    driverApi.getDriverQrCode()
      .then((res) => {
        if (mounted) setQrData(res);
      })
      .catch(() => {
        if (mounted) {
          showToast('Could not load QR code information.', 'info');
        }
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const qrUrl = qrData?.qr_url;
  const unitCode =
    qrData?.unit_code ||
    driver?.tricycle?.unitCode ||
    (driver?.tricycle?.id ? `TRV-${String(driver.tricycle.id).padStart(3, '0')}` : '—');
  const stickerNumber =
    qrData?.sticker_number ||
    driver?.tricycle?.stickerNumber ||
    driver?.tricycle?.codingNumber ||
    '—';
  const plateNumber = qrData?.plate_number || driver?.tricycle?.plateNumber || '—';
  const capacityValue = qrData?.passenger_capacity ?? driver?.tricycle?.passengerCapacity;
  const capacityLabel = capacityValue != null ? `${capacityValue} passengers` : 'Not Configured';

  const statusTone =
    qrData?.status === 'ready'
      ? 'success'
      : qrData?.status === 'capacity_required'
      ? 'warning'
      : 'neutral';

  const handleDownloadImage = async () => {
    if (!qrUrl) {
      showToast('QR code is not available.', 'info');
      return;
    }
    setDownloadingImage(true);
    try {
      showToast('Downloading QR image…', 'info');
      await downloadQrImage(qrUrl, `trivora-scan-to-ride-${unitCode}.png`);
      showToast('QR image downloaded.', 'success');
    } catch {
      showToast('Could not download QR image.', 'info');
    } finally {
      setDownloadingImage(false);
    }
  };

  const handleDownloadPdf = async () => {
    const printUrl = qrData?.print_url;
    if (!printUrl) {
      showToast('Printable sheet is not available.', 'info');
      return;
    }
    setDownloadingPdf(true);
    try {
      showToast('Opening printable QR sheet…', 'info');
      await downloadQrPdf(printUrl);
    } catch {
      showToast('Could not open QR sheet.', 'info');
    } finally {
      setDownloadingPdf(false);
    }
  };

  return (
    <View style={styles.container}>
      <ScreenHeader title="Assigned QR Code" onBack={onBack} />

      <ScrollView contentContainerStyle={styles.content}>
        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={styles.loadingText}>Loading assigned QR code…</Text>
          </View>
        ) : qrUrl ? (
          <>
            {/* Status & QR Container */}
            <View style={styles.mainCard}>
              <View style={styles.cardHeader}>
                <View style={styles.headerInfo}>
                  <Text style={styles.cardTitle}>Walk-in Ride QR</Text>
                  <Text style={styles.cardSubtitle}>Scan to Ride for Tricycle Unit {unitCode}</Text>
                </View>
                <StatusBadge
                  label={qrData?.status_label || 'Ready'}
                  tone={statusTone}
                  size="sm"
                />
              </View>

              {/* Vector QR Code */}
              <View style={styles.qrWrapper}>
                <DriverQrCodeView value={qrUrl} size={210} />
              </View>

              <Text style={styles.qrInstructions}>
                Point passengers to this QR code to initiate a quick scan-to-ride session.
              </Text>

              {qrData?.note ? (
                <View
                  style={[
                    styles.noteBox,
                    qrData.status === 'capacity_required' && styles.noteBoxWarning,
                  ]}
                >
                  {qrData.status === 'capacity_required' ? (
                    <AlertTriangle size={15} color={COLORS.amber} style={styles.noteIcon} />
                  ) : (
                    <Info size={15} color={COLORS.primary} style={styles.noteIcon} />
                  )}
                  <Text
                    style={[
                      styles.noteText,
                      qrData.status === 'capacity_required' && styles.noteTextWarning,
                    ]}
                  >
                    {qrData.note}
                  </Text>
                </View>
              ) : null}

              {/* Action Buttons */}
              <View style={styles.actionsRow}>
                <Button
                  label="Download Image"
                  icon={Download}
                  variant="outline"
                  size="md"
                  onPress={handleDownloadImage}
                  loading={downloadingImage}
                  disabled={downloadingImage || downloadingPdf}
                  style={styles.actionBtn}
                />
                <Button
                  label="Download PDF"
                  icon={Printer}
                  variant="outline"
                  size="md"
                  onPress={handleDownloadPdf}
                  loading={downloadingPdf}
                  disabled={downloadingImage || downloadingPdf}
                  style={styles.actionBtn}
                />
              </View>
            </View>

            {/* Vehicle & Unit Details */}
            <Text style={styles.sectionLabel}>ASSIGNED UNIT SPECIFICATIONS</Text>
            <View style={styles.detailsCard}>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Sticker Number</Text>
                <Text style={styles.detailValue}>{stickerNumber}</Text>
              </View>
              <View style={styles.divider} />

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Unit Code</Text>
                <Text style={styles.detailValueHighlight}>{unitCode}</Text>
              </View>
              <View style={styles.divider} />

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Plate Number</Text>
                <Text style={styles.detailValue}>{plateNumber}</Text>
              </View>
              <View style={styles.divider} />

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Passenger Capacity</Text>
                <Text style={styles.detailValue}>{capacityLabel}</Text>
              </View>
              <View style={styles.divider} />

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>QR Status</Text>
                <StatusBadge
                  label={qrData?.status_label || 'Ready'}
                  tone={statusTone}
                  size="sm"
                />
              </View>
            </View>

            {/* How it works info card */}
            <View style={styles.guideCard}>
              <View style={styles.guideHeader}>
                <ShieldCheck size={18} color={COLORS.primary} />
                <Text style={styles.guideTitle}>Official Municipal Walk-in QR</Text>
              </View>
              <Text style={styles.guideText}>
                • Print and mount this A6 QR sheet visibly inside your tricycle cab.
              </Text>
              <Text style={styles.guideText}>
                • Passengers scan using their phone camera or the Trivora Passenger App.
              </Text>
              <Text style={styles.guideText}>
                • Fares and passenger headcounts are automatically logged into your driver trip session.
              </Text>
            </View>
          </>
        ) : (
          <View style={styles.emptyCard}>
            <View style={styles.emptyIconCircle}>
              <QrCode size={36} color={COLORS.textMuted} />
            </View>
            <Text style={styles.emptyTitle}>No Tricycle Assigned</Text>
            <Text style={styles.emptyDesc}>
              Your driver account currently does not have an assigned tricycle unit. Please visit or contact
              the Nasugbu Traffic Management Office (TMO) to assign a unit to your franchise.
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    padding: SPACING.md,
    gap: SPACING.md,
    paddingBottom: 48,
  },
  loadingBox: {
    paddingVertical: 64,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.textSecondary,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginTop: 4,
  },
  mainCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.xl,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    ...SHADOWS.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: SPACING.md,
    gap: 8,
  },
  headerInfo: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  cardSubtitle: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  qrWrapper: {
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginVertical: SPACING.sm,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.sm,
  },
  qrInstructions: {
    fontSize: 12,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: 8,
    marginHorizontal: 12,
    lineHeight: 18,
  },
  noteBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primaryTint,
    borderRadius: RADIUS.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 12,
    width: '100%',
    gap: 8,
  },
  noteBoxWarning: {
    backgroundColor: '#FEF3C7',
  },
  noteIcon: {
    flexShrink: 0,
  },
  noteText: {
    flex: 1,
    fontSize: 12,
    color: COLORS.primary,
    fontWeight: '600',
    lineHeight: 16,
  },
  noteTextWarning: {
    color: '#92400E',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: SPACING.lg,
    width: '100%',
  },
  actionBtn: {
    flex: 1,
  },
  detailsCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.xl,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.sm,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: COLORS.border,
  },
  detailLabel: {
    fontSize: 13,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  detailValue: {
    fontSize: 13,
    color: COLORS.textPrimary,
    fontWeight: '700',
  },
  detailValueHighlight: {
    fontSize: 13,
    color: COLORS.primary,
    fontWeight: '800',
  },
  guideCard: {
    backgroundColor: COLORS.surfaceInput,
    borderRadius: RADIUS.xl,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 8,
  },
  guideHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  guideTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  guideText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    lineHeight: 18,
  },
  emptyCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.xl,
    padding: SPACING.xl,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    marginTop: 20,
    ...SHADOWS.sm,
  },
  emptyIconCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: COLORS.surfaceInput,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.textPrimary,
    marginBottom: 8,
  },
  emptyDesc: {
    fontSize: 13,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
});

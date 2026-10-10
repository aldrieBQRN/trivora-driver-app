import React, { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { COLORS, RADIUS, SHADOWS, SPACING, TYPOGRAPHY } from '../constants/theme';
import { useDriverAuth } from '../context/DriverAuthContext';
import { DriverQrCodeData } from '../types';
import {
  QrCode,
  Download,
  Printer,
  ShieldCheck,
  AlertTriangle,
  Users,
  Minus,
  Plus,
  X,
  ChevronRight,
} from 'lucide-react-native';
import ScreenHeader from '../components/ScreenHeader';
import Button from '../components/Button';
import DriverQrCodeView, { downloadQrImage, downloadQrPdf } from '../components/DriverQrCodeView';
import { useToast } from '../components/Toast';
import { driverApi } from '../services/api';

interface DriverQrCodeScreenProps {
  onBack: () => void;
}

// In-memory module cache for 0ms instantaneous opening across screen transitions
let cachedQrState: { driverId: number; data: DriverQrCodeData } | null = null;

/**
 * Prefetches the driver's QR code in the background (e.g. while on the Profile tab)
 * so opening the Assigned QR Code screen is instantaneous with 0ms delay.
 */
export function prefetchDriverQrCode(driverId?: number): void {
  if (!driverId) return;
  if (cachedQrState && cachedQrState.driverId === driverId) return;

  driverApi
    .getDriverQrCode()
    .then((res) => {
      if (res?.qr_url) {
        cachedQrState = { driverId, data: res };
        AsyncStorage.setItem(`@trivora_driver_qr_code_${driverId}`, JSON.stringify(res)).catch(() => {});
      }
    })
    .catch(() => {});
}

export default function DriverQrCodeScreen({ onBack }: DriverQrCodeScreenProps) {
  const { showToast } = useToast();
  const { driver, refreshProfile } = useDriverAuth();

  // Instant in-memory cache initialization (0ms initial render if already visited or prefetched)
  const initialCache =
    cachedQrState && cachedQrState.driverId === driver?.id ? cachedQrState.data : null;

  const [qrData, setQrData] = useState<DriverQrCodeData | null>(initialCache);
  const [loading, setLoading] = useState<boolean>(!initialCache);
  const [downloadingImage, setDownloadingImage] = useState<boolean>(false);
  const [downloadingPdf, setDownloadingPdf] = useState<boolean>(false);
  const [capacityInput, setCapacityInput] = useState<string>('');
  const [savingCapacity, setSavingCapacity] = useState<boolean>(false);
  const [capacityError, setCapacityError] = useState<string | null>(null);
  const [showCapacityModal, setShowCapacityModal] = useState<boolean>(false);

  // Stale-While-Revalidate: render cached data immediately, then silently sync in background
  useEffect(() => {
    let mounted = true;
    const driverId = driver?.id;

    const syncFreshData = () => {
      driverApi
        .getDriverQrCode()
        .then((res) => {
          if (!mounted) return;
          setQrData(res);
          if (driverId) {
            cachedQrState = { driverId, data: res };
            AsyncStorage.setItem(`@trivora_driver_qr_code_${driverId}`, JSON.stringify(res)).catch(() => {});
          }
        })
        .catch(() => {
          if (!mounted) return;
          if (!qrData && !cachedQrState) {
            showToast('Could not load QR code information.', 'info');
          }
        })
        .finally(() => {
          if (mounted) setLoading(false);
        });
    };

    // Case 1: In-memory cache hit -> sync silently in background without blocking UI
    if (cachedQrState && cachedQrState.driverId === driverId) {
      syncFreshData();
      return () => {
        mounted = false;
      };
    }

    // Case 2: Check persistent AsyncStorage cache before network
    if (driverId) {
      AsyncStorage.getItem(`@trivora_driver_qr_code_${driverId}`)
        .then((raw) => {
          if (!mounted) return;
          if (raw) {
            try {
              const saved = JSON.parse(raw) as DriverQrCodeData;
              if (saved?.qr_url) {
                cachedQrState = { driverId, data: saved };
                setQrData(saved);
                setLoading(false);
              }
            } catch {}
          }
          syncFreshData();
        })
        .catch(() => {
          if (mounted) syncFreshData();
        });
    } else {
      syncFreshData();
    }

    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driver?.id]);

  const qrUrl = qrData?.qr_url;
  const stickerNumber =
    qrData?.sticker_number ||
    driver?.tricycle?.stickerNumber ||
    driver?.tricycle?.codingNumber ||
    '—';
  const plateNumber = qrData?.plate_number || driver?.tricycle?.plateNumber || '—';
  const capacityValue = qrData?.passenger_capacity ?? driver?.tricycle?.passengerCapacity;
  const capacityConfigured = capacityValue != null;

  useEffect(() => {
    if (!savingCapacity) {
      setCapacityInput(capacityValue != null ? String(capacityValue) : '4');
      setCapacityError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capacityValue]);

  const currentCapacityNum = parseInt(capacityInput, 10) || (capacityValue ?? 4);

  const handleStep = (delta: number) => {
    const next = Math.min(6, Math.max(1, currentCapacityNum + delta));
    setCapacityInput(String(next));
    if (capacityError) setCapacityError(null);
  };

  const handleSaveCapacity = async () => {
    const trimmed = capacityInput.trim();
    const parsed = Number(trimmed);

    if (!trimmed || !Number.isInteger(parsed) || parsed < 1 || parsed > 6) {
      setCapacityError('Enter a whole number between 1 and 6.');
      return;
    }

    setSavingCapacity(true);
    setCapacityError(null);
    try {
      const res = await driverApi.updateQrCapacity(parsed);
      setQrData((prev) => {
        const next = prev ? { ...prev, passenger_capacity: res.passenger_capacity } : prev;
        if (next && driver?.id) {
          cachedQrState = { driverId: driver.id, data: next };
          AsyncStorage.setItem(`@trivora_driver_qr_code_${driver.id}`, JSON.stringify(next)).catch(() => {});
        }
        return next;
      });
      showToast(`Passenger capacity set to ${res.passenger_capacity}.`, 'success');
      refreshProfile();
      setShowCapacityModal(false);
    } catch (err: any) {
      setCapacityError(err?.message || 'Could not save the passenger capacity.');
      showToast('Could not save the passenger capacity.', 'info');
    } finally {
      setSavingCapacity(false);
    }
  };

  const handleDownloadImage = async () => {
    if (!qrUrl) {
      showToast('QR code is not available.', 'info');
      return;
    }
    setDownloadingImage(true);
    try {
      showToast('Downloading QR image…', 'info');
      await downloadQrImage(qrUrl, `trivora-scan-to-ride-${stickerNumber || 'tricycle'}.png`);
      showToast('QR image downloaded.', 'success');
    } catch {
      showToast('Could not download QR image.', 'info');
    } finally {
      setDownloadingImage(false);
    }
  };

  const handleDownloadPdf = async () => {
    if (!qrUrl) {
      showToast('QR code is not available.', 'info');
      return;
    }
    setDownloadingPdf(true);
    try {
      showToast('Downloading QR PDF…', 'info');
      await downloadQrPdf(qrUrl, {
        stickerNumber,
        plateNumber,
        capacity: capacityValue,
        filename: `trivora-scan-to-ride-${stickerNumber || 'tricycle'}.pdf`,
      });
      showToast('QR PDF downloaded.', 'success');
    } catch {
      showToast('Could not download QR PDF.', 'info');
    } finally {
      setDownloadingPdf(false);
    }
  };

  const openCapacityModal = () => {
    setCapacityInput(capacityValue != null ? String(capacityValue) : '4');
    setCapacityError(null);
    setShowCapacityModal(true);
  };

  return (
    <View style={styles.container}>
      <ScreenHeader title="Assigned QR Code" onBack={onBack} />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={styles.loadingText}>Loading assigned QR code…</Text>
          </View>
        ) : qrUrl ? (
          <>
            {/* HERO QR SECTION — Clean unboxed presentation */}
            <View style={styles.heroSection}>
              {/* Top Category Label Pill */}
              <View style={styles.badgeRow}>
                <View style={styles.unitPill}>
                  <QrCode size={13} color={COLORS.primary} />
                  <Text style={styles.unitPillLabel}>Walk-in QR</Text>
                </View>
              </View>

              {/* Vector QR Code in an elegant white frame */}
              <View style={styles.qrStage}>
                <View style={styles.qrFrame}>
                  <DriverQrCodeView value={qrUrl} size={210} />
                </View>
              </View>

              {/* Titles & Instructions */}
              <Text style={styles.heroTitle}>Walk-in Scan to Ride</Text>
              <Text style={styles.heroSubtitle}>
                Passengers scan this code to begin a quick metered trip session
              </Text>

              {/* Note / Warning if capacity is required */}
              {qrData?.note ? (
                <View
                  style={[
                    styles.alertBanner,
                    qrData.status === 'capacity_required' && styles.alertBannerWarning,
                  ]}
                >
                  <AlertTriangle
                    size={15}
                    color={qrData.status === 'capacity_required' ? COLORS.amberDark : COLORS.primary}
                    style={styles.alertIcon}
                  />
                  <Text
                    style={[
                      styles.alertText,
                      qrData.status === 'capacity_required' && styles.alertTextWarning,
                    ]}
                  >
                    {qrData.note}
                  </Text>
                </View>
              ) : null}

              {/* Action Buttons Row */}
              <View style={styles.actionRow}>
                <Button
                  label="Image"
                  icon={Download}
                  variant="outline"
                  size="md"
                  onPress={handleDownloadImage}
                  loading={downloadingImage}
                  disabled={downloadingImage || downloadingPdf}
                  style={styles.actionBtn}
                />
                <Button
                  label="PDF"
                  icon={Printer}
                  variant="primary"
                  size="md"
                  onPress={handleDownloadPdf}
                  loading={downloadingPdf}
                  disabled={downloadingImage || downloadingPdf}
                  style={styles.actionBtn}
                />
              </View>
            </View>

            {/* UNIFIED SPECIFICATIONS STRIP — Clean 2-part stat strip */}
            <View style={styles.specsStrip}>
              <View style={styles.specItem}>
                <Text style={styles.specLabel}>STICKER #</Text>
                <Text style={styles.specValue}>{stickerNumber}</Text>
              </View>
              <View style={styles.specDivider} />
              <View style={styles.specItem}>
                <Text style={styles.specLabel}>PLATE #</Text>
                <Text style={styles.specValue}>{plateNumber}</Text>
              </View>
            </View>

            {/* PASSENGER CAPACITY VIEW-ONLY CARD WITH LINK TO MODAL */}
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionLabel}>PASSENGER CAPACITY</Text>
              {!capacityConfigured && (
                <Text style={styles.sectionLabelWarning}>Action Required</Text>
              )}
            </View>

            <TouchableOpacity
              style={styles.capacityCard}
              onPress={openCapacityModal}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Configure passenger capacity"
            >
              <View style={styles.capacityIconWrap}>
                <Users size={18} color={COLORS.primary} />
              </View>

              <View style={styles.capacityInfoText}>
                <Text style={styles.capacityTitle}>Passenger Capacity</Text>
                <Text style={styles.capacitySubtitle} numberOfLines={1}>
                  {capacityConfigured
                    ? `${capacityValue} ${capacityValue === 1 ? 'seat' : 'seats'} configured`
                    : 'Not configured · Tap to set'}
                </Text>
              </View>

              <ChevronRight size={18} color={COLORS.textSecondary} />
            </TouchableOpacity>

            {/* OFFICIAL GUIDELINES — Clean step list */}
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionLabel}>OFFICIAL WALK-IN GUIDELINES</Text>
            </View>

            <View style={styles.guidelinesList}>
              <View style={styles.guideStepItem}>
                <View style={styles.guideStepIconWrap}>
                  <Printer size={15} color={COLORS.primary} />
                </View>
                <View style={styles.guideStepContent}>
                  <Text style={styles.guideStepTitle}>Mount Inside Cabin</Text>
                  <Text style={styles.guideStepDesc}>
                    Print the A6 sheet and mount it visibly inside your tricycle cab.
                  </Text>
                </View>
              </View>

              <View style={styles.guideStepItem}>
                <View style={styles.guideStepIconWrap}>
                  <QrCode size={15} color={COLORS.primary} />
                </View>
                <View style={styles.guideStepContent}>
                  <Text style={styles.guideStepTitle}>Passenger Scans to Board</Text>
                  <Text style={styles.guideStepDesc}>
                    Walk-in passengers scan via phone camera or Trivora Passenger App.
                  </Text>
                </View>
              </View>

              <View style={styles.guideStepItem}>
                <View style={styles.guideStepIconWrap}>
                  <ShieldCheck size={15} color={COLORS.primary} />
                </View>
                <View style={styles.guideStepContent}>
                  <Text style={styles.guideStepTitle}>Automated Trip Logging</Text>
                  <Text style={styles.guideStepDesc}>
                    Fares, seat occupancy, and trip details automatically record to your active shift.
                  </Text>
                </View>
              </View>
            </View>
          </>
        ) : (
          <View style={styles.emptyContainer}>
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

      {/* BOTTOM MODAL FOR PASSENGER CAPACITY */}
      <Modal
        visible={showCapacityModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowCapacityModal(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <TouchableOpacity
            style={StyleSheet.absoluteFillObject}
            activeOpacity={1}
            onPress={() => setShowCapacityModal(false)}
          />

          <View style={styles.modalSheet}>
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.modalTitle}>Passenger Capacity</Text>
                <Text style={styles.modalSubtitle}>
                  Set maximum authorized passengers for this unit
                </Text>
              </View>
              <TouchableOpacity
                style={styles.modalCloseBtn}
                onPress={() => setShowCapacityModal(false)}
                activeOpacity={0.7}
                accessibilityLabel="Close"
              >
                <X size={20} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* Stepper Control in Modal */}
            <View style={styles.modalBody}>
              <View style={styles.stepperContainer}>
                <TouchableOpacity
                  style={[styles.stepBtn, currentCapacityNum <= 1 && styles.stepBtnDisabled]}
                  onPress={() => handleStep(-1)}
                  disabled={currentCapacityNum <= 1 || savingCapacity}
                  activeOpacity={0.7}
                  accessibilityLabel="Decrease capacity"
                >
                  <Minus
                    size={20}
                    color={currentCapacityNum <= 1 ? COLORS.textMuted : COLORS.textPrimary}
                  />
                </TouchableOpacity>

                <View style={styles.stepInputWrap}>
                  <Text
                    style={[
                      styles.stepValueText,
                      capacityError ? styles.stepInputError : null,
                    ]}
                    accessibilityLabel={`Selected passenger capacity: ${currentCapacityNum}`}
                  >
                    {currentCapacityNum}
                  </Text>
                </View>

                <TouchableOpacity
                  style={[styles.stepBtn, currentCapacityNum >= 6 && styles.stepBtnDisabled]}
                  onPress={() => handleStep(1)}
                  disabled={currentCapacityNum >= 6 || savingCapacity}
                  activeOpacity={0.7}
                  accessibilityLabel="Increase capacity"
                >
                  <Plus
                    size={20}
                    color={currentCapacityNum >= 6 ? COLORS.textMuted : COLORS.textPrimary}
                  />
                </TouchableOpacity>
              </View>

              {/* Quick Select Preset Pills */}
              <View style={styles.presetRow}>
                {[1, 2, 3, 4, 5, 6].map((num) => {
                  const isSelected = currentCapacityNum === num;
                  return (
                    <TouchableOpacity
                      key={num}
                      style={[styles.presetChip, isSelected && styles.presetChipSelected]}
                      onPress={() => {
                        setCapacityInput(String(num));
                        if (capacityError) setCapacityError(null);
                      }}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[
                          styles.presetChipText,
                          isSelected && styles.presetChipTextSelected,
                        ]}
                      >
                        {num}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {capacityError ? (
                <Text style={styles.modalErrorText}>{capacityError}</Text>
              ) : (
                <Text style={styles.modalHint}>
                  Tricycle seating capacity can be set from 1 up to 6 passengers. Walk-in QR rides enforce this limit automatically.
                </Text>
              )}
            </View>

            {/* Modal Action Buttons */}
            <View style={styles.modalActionsRow}>
              <Button
                label="Cancel"
                variant="outline"
                size="md"
                onPress={() => setShowCapacityModal(false)}
                disabled={savingCapacity}
                style={styles.modalActionBtn}
              />
              <Button
                label={savingCapacity ? 'Saving…' : 'Save Capacity'}
                variant="primary"
                size="md"
                onPress={handleSaveCapacity}
                loading={savingCapacity}
                disabled={savingCapacity}
                style={styles.modalActionBtn}
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.xxl,
    gap: SPACING.lg,
  },
  loadingBox: {
    paddingVertical: 72,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },

  // Hero Section
  heroSection: {
    alignItems: 'center',
    paddingTop: 0,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: SPACING.sm + 2,
  },
  unitPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.surfaceInput,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  unitPillLabel: {
    ...TYPOGRAPHY.caption,
    color: COLORS.primary,
    fontWeight: '600',
  },
  qrStage: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: SPACING.xs,
  },
  qrFrame: {
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: RADIUS.xxl,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.md,
  },
  heroTitle: {
    ...TYPOGRAPHY.h2,
    color: COLORS.textPrimary,
    marginTop: SPACING.md,
    textAlign: 'center',
  },
  heroSubtitle: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textSecondary,
    marginTop: 4,
    textAlign: 'center',
    paddingHorizontal: SPACING.md,
    lineHeight: 18,
  },

  // Alert Callout
  alertBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primaryTint,
    borderRadius: RADIUS.lg,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: SPACING.sm + 4,
    gap: 8,
    maxWidth: 360,
    width: '100%',
  },
  alertBannerWarning: {
    backgroundColor: COLORS.amberLight,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  alertIcon: {
    flexShrink: 0,
  },
  alertText: {
    ...TYPOGRAPHY.caption,
    color: COLORS.primary,
    fontWeight: '600',
    flex: 1,
    lineHeight: 16,
  },
  alertTextWarning: {
    color: COLORS.amberDark,
  },

  // Actions
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: SPACING.lg,
    width: '100%',
  },
  actionBtn: {
    flex: 1,
  },

  // Horizontal Specs Strip
  specsStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.backgroundSubtle,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    paddingVertical: 12,
    paddingHorizontal: SPACING.xs,
  },
  specItem: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
  },
  specLabel: {
    ...TYPOGRAPHY.label,
    fontSize: 10,
    color: COLORS.textMuted,
  },
  specValue: {
    ...TYPOGRAPHY.bodyLarge,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  specValuePrimary: {
    color: COLORS.primary,
  },
  specDivider: {
    width: 1,
    height: 24,
    backgroundColor: COLORS.border,
  },

  // Section Headers
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: SPACING.xs,
    marginBottom: -SPACING.xs,
  },
  sectionLabel: {
    ...TYPOGRAPHY.label,
    color: COLORS.textMuted,
    letterSpacing: 0.6,
  },
  sectionLabelWarning: {
    ...TYPOGRAPHY.caption,
    fontSize: 11,
    color: COLORS.amberDark,
    fontWeight: '600',
  },

  // View-Only Capacity Row / Card
  capacityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.backgroundSubtle,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    padding: SPACING.md,
    gap: 12,
  },
  capacityIconWrap: {
    width: 38,
    height: 38,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  capacityInfoText: {
    flex: 1,
    gap: 2,
  },
  capacityTitle: {
    ...TYPOGRAPHY.bodyLarge,
    color: COLORS.textPrimary,
  },
  capacitySubtitle: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textSecondary,
  },
  // Guidelines List
  guidelinesList: {
    gap: SPACING.sm + 2,
    paddingHorizontal: 2,
  },
  guideStepItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  guideStepIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: COLORS.surfaceInput,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  guideStepContent: {
    flex: 1,
    gap: 2,
  },
  guideStepTitle: {
    ...TYPOGRAPHY.bodySmall,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  guideStepDesc: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textSecondary,
    lineHeight: 16,
  },

  // Empty State
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: SPACING.xxl,
    paddingHorizontal: SPACING.lg,
    marginTop: SPACING.lg,
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
    ...TYPOGRAPHY.h2,
    color: COLORS.textPrimary,
    marginBottom: 8,
  },
  emptyDesc: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },

  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: COLORS.background,
    borderTopLeftRadius: RADIUS.xxl,
    borderTopRightRadius: RADIUS.xxl,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
    paddingBottom: Platform.OS === 'ios' ? SPACING.xxl : SPACING.lg,
    gap: SPACING.md + 2,
    ...SHADOWS.sheet,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  modalTitle: {
    ...TYPOGRAPHY.h2,
    color: COLORS.textPrimary,
  },
  modalSubtitle: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textSecondary,
  },
  modalCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.surfaceInput,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBody: {
    alignItems: 'center',
    gap: 16,
    paddingVertical: SPACING.xs,
  },
  stepperContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surfaceInput,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 4,
  },
  stepBtn: {
    width: 48,
    height: 48,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surface,
    ...SHADOWS.sm,
  },
  stepBtnDisabled: {
    opacity: 0.35,
    elevation: 0,
    shadowOpacity: 0,
  },
  stepInputWrap: {
    width: 64,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepValueText: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.textPrimary,
    textAlign: 'center',
    includeFontPadding: false,
  },
  stepInputError: {
    color: COLORS.danger,
  },
  presetRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  presetChip: {
    minWidth: 42,
    height: 38,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.surfaceInput,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  presetChipSelected: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  presetChipText: {
    ...TYPOGRAPHY.bodySmall,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  presetChipTextSelected: {
    color: COLORS.textInverse,
    fontWeight: '700',
  },
  modalHint: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: SPACING.sm,
  },
  modalErrorText: {
    ...TYPOGRAPHY.caption,
    color: COLORS.danger,
    fontWeight: '600',
    textAlign: 'center',
  },
  modalActionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: SPACING.xs,
  },
  modalActionBtn: {
    flex: 1,
  },
});

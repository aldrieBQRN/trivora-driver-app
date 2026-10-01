import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Image,
  ScrollView,
} from 'react-native';
import { Banknote, Smartphone, AlertCircle } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, RADIUS, SPACING, TYPOGRAPHY } from '../constants/theme';
import Button from './Button';
import ScreenHeader from './ScreenHeader';
import { useToast } from './Toast';
import { driverApi } from '../services/api';
import { DriverGcashQrStatus, PaymentStatus } from '../types';

export interface PassengerPaymentTarget {
  bookingId: number | string;
  bookingCode: string;
  passengerName?: string | null;
  fare: number;
  paymentMethod: 'cash' | 'gcash' | string;
  paymentStatus: PaymentStatus | string;
  paymentReference?: string | null;
  source?: 'qr' | 'walk_in';
}

interface DriverPaymentModalProps {
  visible: boolean;
  onClose: () => void;
  target: PassengerPaymentTarget | null;
  onSuccess: (bookingCode: string) => void;
}

/**
 * The driver's full-screen payment collection page for ONE passenger (QR or manual walk-in) after
 * drop-off - each booking is settled on its own, never per ride session. Only the fields for that
 * booking's method are shown: Cash = amount received + change; GCash = the driver's own configured
 * QR + the reference number the passenger reads out. The backend fare is authoritative and the
 * server validates and confirms; the passenger app only shows the resulting payment status.
 */
export default function DriverPaymentModal({
  visible,
  onClose,
  target,
  onSuccess,
}: DriverPaymentModalProps) {
  const { showToast } = useToast();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [driverGcash, setDriverGcash] = useState<DriverGcashQrStatus | null>(null);
  // Until the QR lookup finishes, show a loader — never the "no QR" warning for a QR that is
  // simply still loading.
  const [gcashChecked, setGcashChecked] = useState(false);
  const hasDriverQr = Boolean((driverGcash?.has_gcash_qr || driverGcash?.configured || driverGcash?.gcash_qr_url) && driverGcash?.gcash_qr_url);

  // Cash state
  const [amountReceived, setAmountReceived] = useState('');

  // GCash state
  const [manualGcashRef, setManualGcashRef] = useState('');
  const [currentStatus, setCurrentStatus] = useState<string>('unpaid');
  const [currentReference, setCurrentReference] = useState<string | null>(null);

  const fare = Number(target?.fare ?? 0);
  const isCash = (target?.paymentMethod || 'cash') === 'cash';
  const isWalkIn = target?.source === 'walk_in';

  useEffect(() => {
    if (visible && target) {
      setCurrentStatus(target.paymentStatus || 'unpaid');
      setCurrentReference(target.paymentReference || null);
      setAmountReceived(String(target.fare || ''));
      setManualGcashRef('');
      setSubmitting(false);

      if (!isCash || isWalkIn) {
        setLoading(true);
        driverApi
          .getGcashQr()
          .then((res) => setDriverGcash(res))
          .catch(() => {})
          .finally(() => {
            setLoading(false);
            setGcashChecked(true);
          });
      }
    }
  }, [visible, target?.bookingCode]);

  if (!target) return null;

  // Amount received parsed as number
  const amountNum = parseFloat(amountReceived) || 0;
  const changeAmount = amountNum >= fare ? amountNum - fare : 0;
  const isInsufficient = amountNum < fare;

  const handleQuickCash = (amount: number) => {
    setAmountReceived(String(amount));
  };

  const handleConfirmCash = async () => {
    if (isInsufficient) {
      showToast('Amount received must be at least the total fare.', 'info');
      return;
    }
    setSubmitting(true);
    try {
      const res = await driverApi.confirmCashPayment(target.bookingCode, amountNum);
      // The server's recorded change (from its own fare), falling back to the live preview.
      const change = Number(res.booking?.payment_change_amount ?? changeAmount);
      showToast(`Cash payment confirmed. Change: ₱${change.toFixed(2)}`);
      onSuccess(target.bookingCode);
      onClose();
    } catch (err: any) {
      showToast(err?.message || 'Could not confirm cash payment.', 'info');
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmGcash = async () => {
    if (manualGcashRef.trim().length < 4) {
      showToast('Enter the GCash reference number provided by the passenger.', 'info');
      return;
    }
    setSubmitting(true);
    try {
      if (isWalkIn) {
        await driverApi.recordManualGcashPayment(target.bookingCode, manualGcashRef.trim());
      } else {
        await driverApi.confirmGcashPayment(target.bookingCode, manualGcashRef.trim());
      }
      showToast('GCash payment confirmed. Earnings credited.');
      onSuccess(target.bookingCode);
      onClose();
    } catch (err: any) {
      showToast(err?.message || 'Could not confirm GCash payment.', 'info');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRefreshStatus = async () => {
    setLoading(true);
    try {
      const res = await driverApi.qrSessionActive();
      const p = res?.ride?.passengers.find((item) => item.booking_code === target.bookingCode);
      if (p) {
        setCurrentStatus(p.payment_status);
        setCurrentReference(p.payment_reference || null);
        if (p.payment_status === 'paid') {
          showToast('Payment already confirmed.');
          onSuccess(target.bookingCode);
          onClose();
        }
      }
    } catch {
      showToast('Could not refresh payment status.', 'info');
    } finally {
      setLoading(false);
    }
  };

  const passengerLabel = target.passengerName || (isWalkIn ? 'Walk-in Passenger' : 'Passenger');

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScreenHeader title="Payment" subtitle={`${passengerLabel} · ${target.bookingCode}`} onBack={onClose} />

        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          {/* Fare + method — the backend fare; the client never decides it */}
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Fare</Text>
            <Text style={styles.summaryFare}>₱{fare.toFixed(2)}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Payment Method</Text>
            <View style={styles.methodValue}>
              {isCash ? <Banknote size={16} color={COLORS.primary} /> : <Smartphone size={16} color={COLORS.primary} />}
              <Text style={styles.methodText}>{isCash ? 'Cash' : 'GCash'}</Text>
            </View>
          </View>
          <View style={styles.divider} />

          {isCash ? (
            <View style={styles.cashSection}>
              <View>
                <Text style={styles.sectionLabel}>AMOUNT TO COLLECT</Text>
                <Text style={styles.fareHeroAmount}>₱{fare.toFixed(2)}</Text>
              </View>

              <Text style={styles.sectionLabel}>AMOUNT RECEIVED</Text>
              <View style={styles.amountInputRow}>
                <Text style={styles.currencyPrefix}>₱</Text>
                <TextInput
                  style={styles.amountInput}
                  keyboardType="numeric"
                  value={amountReceived}
                  onChangeText={setAmountReceived}
                  placeholder="0.00"
                  placeholderTextColor={COLORS.textMuted}
                />
              </View>

              {/* Quick denomination buttons */}
              <View style={styles.quickCashRow}>
                <TouchableOpacity
                  style={[styles.quickCashChip, amountNum === fare && styles.quickCashChipActive]}
                  onPress={() => handleQuickCash(fare)}
                >
                  <Text style={[styles.quickCashText, amountNum === fare && styles.quickCashTextActive]}>
                    Exact (₱{fare.toFixed(0)})
                  </Text>
                </TouchableOpacity>

                {[50, 100, 200, 500].filter((amt) => amt > fare).map((amt) => (
                  <TouchableOpacity
                    key={amt}
                    style={[styles.quickCashChip, amountNum === amt && styles.quickCashChipActive]}
                    onPress={() => handleQuickCash(amt)}
                  >
                    <Text style={[styles.quickCashText, amountNum === amt && styles.quickCashTextActive]}>
                      ₱{amt}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Live change preview — the server recomputes it from its own fare on confirm */}
              <View style={[styles.changeBox, isInsufficient ? styles.changeBoxError : styles.changeBoxSuccess]}>
                <Text style={styles.changeLabel}>{isInsufficient ? 'INSUFFICIENT AMOUNT' : 'CHANGE'}</Text>
                <Text style={[styles.changeValue, isInsufficient && styles.changeValueError]}>
                  {isInsufficient ? `Need ₱${(fare - amountNum).toFixed(2)} more` : `₱${changeAmount.toFixed(2)}`}
                </Text>
              </View>

            </View>
          ) : (
            /* GCash: the driver shows their own QR, the passenger pays in their GCash app and reads
               out the reference, the driver enters it and confirms. */
            <View style={styles.gcashSection}>
              <Text style={styles.sectionTitle}>GCash Payment</Text>
              <Text style={styles.instruction}>Show this QR code to the passenger.</Text>

              {loading || !gcashChecked ? (
                <ActivityIndicator size="small" color={COLORS.primary} style={{ marginVertical: SPACING.md }} />
              ) : hasDriverQr && driverGcash?.gcash_qr_url ? (
                <View style={styles.driverQrBox}>
                  <Image source={{ uri: driverGcash.gcash_qr_url }} style={styles.qrImage} resizeMode="contain" />
                  {driverGcash.gcash_name ? <Text style={styles.driverQrName}>{driverGcash.gcash_name}</Text> : null}
                  {driverGcash.gcash_number ? <Text style={styles.driverQrNumber}>{driverGcash.gcash_number}</Text> : null}
                </View>
              ) : (
                <View style={styles.warningBox}>
                  <AlertCircle size={16} color={COLORS.danger} />
                  <Text style={styles.warningText}>
                    No GCash QR configured in your Profile. You can still enter the reference number if the passenger paid directly to your GCash number.
                  </Text>
                </View>
              )}

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>GCash Reference Number</Text>
                <Text style={styles.instruction}>Enter the GCash reference number provided by the passenger.</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="e.g. 1023456789"
                  placeholderTextColor={COLORS.textMuted}
                  value={manualGcashRef}
                  onChangeText={setManualGcashRef}
                  keyboardType="numeric"
                />
              </View>

            </View>
          )}
        </ScrollView>

        {/* Confirm pinned to the bottom — only the action for this booking's method */}
        <View style={styles.footer}>
          {isCash ? (
            <Button
              label={submitting ? 'Confirming…' : 'Confirm Cash Received'}
              onPress={handleConfirmCash}
              loading={submitting}
              disabled={isInsufficient || submitting}
            />
          ) : (
            <Button
              label={submitting ? 'Confirming…' : 'Confirm GCash Payment'}
              onPress={handleConfirmGcash}
              loading={submitting}
              disabled={manualGcashRef.trim().length < 4 || submitting}
            />
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  footer: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
    backgroundColor: COLORS.background,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  summaryLabel: {
    ...TYPOGRAPHY.body,
    color: COLORS.textSecondary,
  },
  summaryFare: {
    ...TYPOGRAPHY.h2,
    color: COLORS.textPrimary,
  },
  methodValue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  methodText: {
    ...TYPOGRAPHY.body,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.borderLight,
  },
  sectionTitle: {
    ...TYPOGRAPHY.h3,
    color: COLORS.textPrimary,
  },
  scrollContent: {
    padding: SPACING.lg,
    gap: SPACING.md,
  },
  flex: {
    flex: 1,
  },
  fareHero: {
    alignItems: 'center',
    paddingVertical: SPACING.md,
    backgroundColor: COLORS.backgroundSubtle,
    borderRadius: RADIUS.lg,
  },
  passengerSubtitle: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textSecondary,
    marginBottom: 4,
  },
  fareHeroLabel: {
    ...TYPOGRAPHY.label,
    color: COLORS.textMuted,
  },
  fareHeroAmount: {
    ...TYPOGRAPHY.hero,
    color: COLORS.primary,
    marginTop: 2,
  },
  sectionLabel: {
    ...TYPOGRAPHY.label,
    color: COLORS.textSecondary,
    marginBottom: SPACING.xs,
  },
  cashSection: {
    gap: SPACING.md,
  },
  amountInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: COLORS.primary,
    borderRadius: RADIUS.lg,
    paddingHorizontal: SPACING.md,
    backgroundColor: COLORS.surface,
  },
  currencyPrefix: {
    ...TYPOGRAPHY.h2,
    color: COLORS.textPrimary,
    marginRight: 6,
  },
  amountInput: {
    flex: 1,
    ...TYPOGRAPHY.h2,
    color: COLORS.textPrimary,
    paddingVertical: SPACING.sm + 4,
  },
  quickCashRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  quickCashChip: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs + 4,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  quickCashChipActive: {
    backgroundColor: COLORS.primaryTint,
    borderColor: COLORS.primary,
  },
  quickCashText: {
    ...TYPOGRAPHY.caption,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  quickCashTextActive: {
    color: COLORS.primary,
  },
  changeBox: {
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    borderWidth: 1,
  },
  changeBoxSuccess: {
    backgroundColor: COLORS.successLight,
    borderColor: COLORS.success,
  },
  changeBoxError: {
    backgroundColor: COLORS.dangerLight,
    borderColor: COLORS.danger,
  },
  changeLabel: {
    ...TYPOGRAPHY.label,
    color: COLORS.textSecondary,
  },
  changeValue: {
    ...TYPOGRAPHY.h2,
    color: COLORS.success,
    marginTop: 2,
  },
  changeValueError: {
    color: COLORS.danger,
  },
  gcashSection: {
    gap: SPACING.md,
  },
  statusHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  fareHeroText: {
    ...TYPOGRAPHY.h3,
    color: COLORS.primary,
    fontWeight: '700',
  },
  refreshBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    padding: 4,
  },
  refreshText: {
    ...TYPOGRAPHY.caption,
    color: COLORS.primary,
    fontWeight: '600',
  },
  instruction: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textSecondary,
    lineHeight: 18,
  },
  driverQrBox: {
    alignItems: 'center',
    backgroundColor: COLORS.backgroundSubtle,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    gap: SPACING.xs,
  },
  qrImage: {
    width: 170,
    height: 170,
    borderRadius: RADIUS.md,
    backgroundColor: '#FFFFFF',
  },
  driverQrName: {
    ...TYPOGRAPHY.body,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginTop: 4,
  },
  driverQrNumber: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textSecondary,
  },
  warningBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: SPACING.sm + 2,
    backgroundColor: COLORS.dangerLight,
    borderRadius: RADIUS.md,
  },
  warningText: {
    ...TYPOGRAPHY.caption,
    color: COLORS.dangerDark,
    flex: 1,
  },
  inputGroup: {
    gap: 6,
  },
  inputLabel: {
    ...TYPOGRAPHY.label,
    color: COLORS.textSecondary,
  },
  textInput: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm + 4,
    ...TYPOGRAPHY.body,
    color: COLORS.textPrimary,
    backgroundColor: COLORS.surface,
  },
  submittedCard: {
    padding: SPACING.md,
    backgroundColor: COLORS.backgroundSubtle,
    borderRadius: RADIUS.lg,
    gap: SPACING.sm,
  },
  statusBadgeAmber: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.amberLight,
    alignSelf: 'flex-start',
  },
  statusBadgeAmberText: {
    ...TYPOGRAPHY.caption,
    color: COLORS.amberDark,
    fontWeight: '600',
  },
  refPrompt: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textSecondary,
    marginTop: 4,
  },
  refNumberContainer: {
    padding: SPACING.md,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
  },
  refNumberText: {
    ...TYPOGRAPHY.h2,
    color: COLORS.textPrimary,
    letterSpacing: 1.5,
  },
  refHelpText: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textMuted,
    lineHeight: 16,
  },
  awaitingCard: {
    padding: SPACING.lg,
    backgroundColor: COLORS.backgroundSubtle,
    borderRadius: RADIUS.lg,
    alignItems: 'center',
    gap: SPACING.sm,
  },
  awaitingTitle: {
    ...TYPOGRAPHY.bodyLarge,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginTop: 4,
  },
  awaitingBody: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
  },
  manualEntryDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    width: '100%',
    marginVertical: SPACING.xs,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: COLORS.borderLight,
  },
  dividerText: {
    ...TYPOGRAPHY.label,
    color: COLORS.textMuted,
  },
});

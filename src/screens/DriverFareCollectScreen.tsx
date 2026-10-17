import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, ActivityIndicator, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, RADIUS, SHADOWS, SPACING, TYPOGRAPHY } from '../constants/theme';
import { useDriverShift } from '../context/DriverShiftContext';
import { useDriverAuth } from '../context/DriverAuthContext';
import { Check, Banknote, Smartphone, CheckCircle2, AlertCircle } from 'lucide-react-native';
import Button from '../components/Button';
import { useToast } from '../components/Toast';
import { driverApi } from '../services/api';
import { DriverGcashQrStatus } from '../types';

export default function DriverFareCollectScreen() {
  const { fareToCollect, activeBooking, finishAndCollectFare } = useDriverShift();
  const { driver } = useDriverAuth();
  const { showToast } = useToast();
  const insets = useSafeAreaInsets();

  const totalFare = fareToCollect ?? activeBooking?.fare ?? 45.0;
  const passengerCount = activeBooking?.passengerCount ?? 1;
  const farePerPassenger = activeBooking?.farePerPassenger ?? totalFare;
  const isCash = (activeBooking?.paymentMethod || 'cash') === 'cash';

  // Payment states
  const [paymentStatus, setPaymentStatus] = useState<string>(activeBooking?.paymentStatus || 'unpaid');
  const [paymentReference, setPaymentReference] = useState<string | null>(activeBooking?.paymentReference || null);
  const [amountReceived, setAmountReceived] = useState<string>(String(totalFare || ''));
  const [changeAmount, setChangeAmount] = useState<number | null>(activeBooking?.paymentChangeAmount ?? null);
  const [submitting, setSubmitting] = useState(false);
  const [manualGcashRef, setManualGcashRef] = useState('');
  const [driverGcash, setDriverGcash] = useState<DriverGcashQrStatus | null>(null);
  // Until the QR lookup finishes, show a loader — never the "no QR" warning for a QR that is
  // simply still loading.
  const [gcashChecked, setGcashChecked] = useState(false);
  const hasDriverQr = Boolean((driverGcash?.has_gcash_qr || driverGcash?.configured || driverGcash?.gcash_qr_url) && driverGcash?.gcash_qr_url);

  // Load driver's GCash QR configuration for payment display
  useEffect(() => {
    if (!isCash && paymentStatus !== 'paid') {
      driverApi
        .getGcashQr()
        .then((res) => setDriverGcash(res))
        .catch(() => {})
        .finally(() => setGcashChecked(true));
    }
  }, [isCash, paymentStatus]);

  // Poll for GCash updates while unpaid
  useEffect(() => {
    if (isCash || paymentStatus === 'paid' || !activeBooking || !driver) return;

    let cancelled = false;
    const checkBooking = async () => {
      try {
        const res = await driverApi.getActiveBooking(driver.id, activeBooking.id);
        if (cancelled || !res?.booking) return;
        const b = res.booking;
        if (b.payment_status && b.payment_status !== paymentStatus) {
          setPaymentStatus(b.payment_status);
        }
        if (b.payment_reference) {
          setPaymentReference(b.payment_reference);
        }
      } catch {}
    };

    const interval = setInterval(checkBooking, 3000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [isCash, paymentStatus, activeBooking?.id, driver?.id]);

  const amountNum = parseFloat(amountReceived) || 0;
  const liveChange = amountNum >= totalFare ? amountNum - totalFare : 0;
  const isInsufficient = amountNum < totalFare;

  const handleQuickCash = (val: number) => {
    setAmountReceived(String(val));
  };

  const handleConfirmCash = async () => {
    if (!activeBooking || isInsufficient) return;
    setSubmitting(true);
    try {
      const res = await driverApi.confirmCashPayment(activeBooking.id, amountNum);
      // The server's recorded change (from its own fare), falling back to the live preview.
      const change = Number(res.booking?.payment_change_amount ?? liveChange);
      setPaymentStatus('paid');
      setChangeAmount(change);
      showToast(`Cash payment confirmed. Change: ₱${change.toFixed(2)}`);
    } catch (err: any) {
      showToast(err?.message || 'Could not confirm cash payment.', 'info');
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmGcash = async () => {
    if (!activeBooking) return;
    if (manualGcashRef.trim().length < 4) {
      showToast('Enter the GCash reference number provided by the passenger.', 'info');
      return;
    }
    setSubmitting(true);
    try {
      await driverApi.confirmGcashPayment(activeBooking.id, manualGcashRef.trim());
      setPaymentStatus('paid');
      setPaymentReference(manualGcashRef.trim());
      showToast('GCash payment confirmed. Earnings credited.');
    } catch (err: any) {
      showToast(err?.message || 'Could not confirm GCash payment.', 'info');
    } finally {
      setSubmitting(false);
    }
  };

  const isPaid = paymentStatus === 'paid';
  const MethodIcon = isCash ? Banknote : Smartphone;
  const quickAmounts = [50, 100, 200, 500].filter((amt) => amt > totalFare);

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingTop: SPACING.lg + insets.top }]}
        keyboardShouldPersistTaps="handled"
      >
        {/* Two states: Collect Payment (confirm in the footer), then Ride Completed. */}
        <View style={styles.header}>
          <View style={[styles.statusCircle, isPaid && styles.statusCirclePaid]}>
            {isPaid ? <Check size={24} color={COLORS.textInverse} strokeWidth={3} /> : <MethodIcon size={22} color={COLORS.textInverse} />}
          </View>
          <View style={styles.headerText}>
            <Text style={styles.title}>{isPaid ? 'Ride Completed' : 'Collect Payment'}</Text>
            {activeBooking && (
              <Text style={styles.subtitle} numberOfLines={1}>
                {isPaid ? `Paid by ${activeBooking.passengerName}` : `From ${activeBooking.passengerName}`}
              </Text>
            )}
          </View>
        </View>

        {/* Fare hero */}
        <View style={[styles.fareCard, isPaid && styles.fareCardPaid]}>
          <View style={styles.fareCardTop}>
            <Text style={styles.fareCardLabel}>{isPaid ? 'TOTAL PAID' : 'TOTAL FARE TO COLLECT'}</Text>
            <View style={styles.methodPill}>
              <MethodIcon size={13} color={COLORS.textInverse} />
              <Text style={styles.methodPillText}>{isCash ? 'Cash' : 'GCash'}</Text>
            </View>
          </View>
          <Text style={styles.fareCardValue}>₱{totalFare.toFixed(2)}</Text>
          <Text style={styles.fareCardBreakdown}>
            ₱{farePerPassenger.toFixed(2)} × {passengerCount} passenger{passengerCount !== 1 ? 's' : ''}
          </Text>
        </View>

        {isPaid ? (
          /* PAID — receipt-style summary */
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <CheckCircle2 size={18} color={COLORS.success} />
              <Text style={styles.cardTitle}>Payment received</Text>
            </View>
            <SummaryRow label="Payment method" value={isCash ? 'Cash' : 'GCash'} />
            {isCash ? (
              <>
                <SummaryRow label="Amount received" value={`₱${(totalFare + (changeAmount ?? 0)).toFixed(2)}`} />
                <SummaryRow label="Change given" value={`₱${(changeAmount ?? 0).toFixed(2)}`} />
              </>
            ) : (
              <SummaryRow label="Reference no." value={paymentReference || '—'} />
            )}
          </View>
        ) : isCash ? (
          /* CASH PAYMENT */
          <View style={styles.card}>
            <Text style={styles.inputLabel}>AMOUNT RECEIVED</Text>
            <View style={[styles.amountInputRow, isInsufficient && styles.amountInputRowError]}>
              <Text style={styles.currencyPrefix}>₱</Text>
              <TextInput
                style={styles.amountInput}
                keyboardType="numeric"
                value={amountReceived}
                onChangeText={setAmountReceived}
                placeholder="0.00"
                placeholderTextColor={COLORS.textMuted}
                selectTextOnFocus
              />
            </View>

            {/* Quick denomination buttons — full-size touch targets */}
            <View style={styles.quickCashRow}>
              {[totalFare, ...quickAmounts].map((amt, i) => {
                const active = amountNum === amt;
                return (
                  <TouchableOpacity
                    key={i === 0 ? 'exact' : amt}
                    style={[styles.quickCashChip, active && styles.quickCashChipActive]}
                    onPress={() => handleQuickCash(amt)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.quickCashText, active && styles.quickCashTextActive]}>
                      {i === 0 ? 'Exact' : `₱${amt}`}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Change calculation */}
            <View style={[styles.changeRow, isInsufficient ? styles.changeRowError : styles.changeRowSuccess]}>
              <Text style={[styles.changeLabel, isInsufficient && styles.changeTextError]}>
                {isInsufficient ? 'Still needed' : 'Change to return'}
              </Text>
              <Text style={[styles.changeValue, isInsufficient && styles.changeTextError]}>
                ₱{(isInsufficient ? totalFare - amountNum : liveChange).toFixed(2)}
              </Text>
            </View>
          </View>
        ) : (
          /* GCASH PAYMENT */
          <View style={styles.card}>
            <StepTitle step={1} title="Let the passenger scan your QR" />
            {!gcashChecked ? (
              <ActivityIndicator size="small" color={COLORS.primary} style={styles.qrLoader} />
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
                  No GCash QR configured in your Profile. You can still enter the reference number if the passenger paid directly to your mobile number.
                </Text>
              </View>
            )}

            <View style={styles.divider} />

            <StepTitle step={2} title="Enter the passenger's GCash reference no." />
            <TextInput
              style={styles.textInput}
              placeholder="e.g. 1023456789"
              placeholderTextColor={COLORS.textMuted}
              value={manualGcashRef}
              onChangeText={setManualGcashRef}
              keyboardType="numeric"
            />
          </View>
        )}
      </ScrollView>

      {/* Footer */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + SPACING.md }]}>
        {isPaid ? (
          <Button label="Done" onPress={finishAndCollectFare} />
        ) : isCash ? (
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
    </View>
  );
}

function StepTitle({ step, title }: { step: number; title: string }) {
  return (
    <View style={styles.stepRow}>
      <View style={styles.stepBadge}>
        <Text style={styles.stepBadgeText}>{step}</Text>
      </View>
      <Text style={styles.stepTitle}>{title}</Text>
    </View>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scroll: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    padding: SPACING.lg,
    gap: SPACING.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm + 4,
  },
  headerText: {
    flex: 1,
  },
  statusCircle: {
    width: 48,
    height: 48,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusCirclePaid: {
    backgroundColor: COLORS.success,
  },
  title: {
    ...TYPOGRAPHY.h2,
    color: COLORS.textPrimary,
  },
  subtitle: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  fareCard: {
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.xl,
    padding: SPACING.lg,
    ...SHADOWS.md,
  },
  fareCardPaid: {
    backgroundColor: COLORS.success,
  },
  fareCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  fareCardLabel: {
    ...TYPOGRAPHY.label,
    color: COLORS.primaryTint,
  },
  methodPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.primaryTint,
  },
  methodPillText: {
    ...TYPOGRAPHY.caption,
    fontWeight: '700',
    color: COLORS.textInverse,
  },
  fareCardValue: {
    ...TYPOGRAPHY.hero,
    color: COLORS.textInverse,
    marginTop: SPACING.sm,
  },
  fareCardBreakdown: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.primaryTint,
    marginTop: 2,
  },
  card: {
    backgroundColor: COLORS.backgroundSubtle,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    gap: SPACING.sm + 4,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardTitle: {
    ...TYPOGRAPHY.bodyLarge,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  summaryLabel: {
    ...TYPOGRAPHY.body,
    color: COLORS.textSecondary,
  },
  summaryValue: {
    ...TYPOGRAPHY.body,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  inputLabel: {
    ...TYPOGRAPHY.label,
    color: COLORS.textSecondary,
  },
  amountInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: COLORS.primary,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    backgroundColor: COLORS.surface,
  },
  amountInputRowError: {
    borderColor: COLORS.danger,
  },
  currencyPrefix: {
    ...TYPOGRAPHY.display,
    color: COLORS.textSecondary,
    marginRight: 6,
  },
  amountInput: {
    flex: 1,
    ...TYPOGRAPHY.display,
    color: COLORS.textPrimary,
    paddingVertical: SPACING.sm + 2,
  },
  quickCashRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  quickCashChip: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  quickCashChipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  quickCashText: {
    ...TYPOGRAPHY.body,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  quickCashTextActive: {
    color: COLORS.textInverse,
  },
  changeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm + 4,
    borderWidth: 1,
  },
  changeRowSuccess: {
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
  },
  changeRowError: {
    backgroundColor: COLORS.dangerLight,
    borderColor: COLORS.dangerBorder,
  },
  changeLabel: {
    ...TYPOGRAPHY.body,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  changeValue: {
    ...TYPOGRAPHY.h2,
    color: COLORS.textPrimary,
  },
  changeTextError: {
    color: COLORS.dangerDark,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  stepBadge: {
    width: 22,
    height: 22,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBadgeText: {
    ...TYPOGRAPHY.caption,
    fontWeight: '700',
    color: COLORS.textInverse,
  },
  stepTitle: {
    ...TYPOGRAPHY.body,
    fontWeight: '700',
    color: COLORS.textPrimary,
    flex: 1,
  },
  qrLoader: {
    marginVertical: SPACING.lg,
  },
  driverQrBox: {
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    gap: 2,
  },
  qrImage: {
    width: 210,
    height: 210,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.surface,
    marginBottom: SPACING.xs,
  },
  driverQrName: {
    ...TYPOGRAPHY.body,
    fontWeight: '700',
    color: COLORS.textPrimary,
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
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
  },
  textInput: {
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm + 4,
    ...TYPOGRAPHY.bodyLarge,
    fontWeight: '600',
    letterSpacing: 1,
    color: COLORS.textPrimary,
    backgroundColor: COLORS.surface,
  },
  footer: {
    padding: SPACING.md,
    backgroundColor: COLORS.background,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
});

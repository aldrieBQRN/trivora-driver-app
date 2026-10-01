import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, ActivityIndicator, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, RADIUS, SPACING, TYPOGRAPHY } from '../constants/theme';
import { useDriverShift } from '../context/DriverShiftContext';
import { useDriverAuth } from '../context/DriverAuthContext';
import { Check, Banknote, Smartphone, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react-native';
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
  const [isRefreshing, setIsRefreshing] = useState(false);
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

  const handleManualRefresh = async () => {
    if (!activeBooking || !driver) return;
    setIsRefreshing(true);
    try {
      const res = await driverApi.getActiveBooking(driver.id, activeBooking.id);
      if (res?.booking) {
        if (res.booking.payment_status) setPaymentStatus(res.booking.payment_status);
        if (res.booking.payment_reference) setPaymentReference(res.booking.payment_reference);
        showToast('Payment status updated.');
      }
    } catch {
      showToast('Could not refresh status.', 'info');
    } finally {
      setIsRefreshing(false);
    }
  };

  const isPaid = paymentStatus === 'paid';

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {/* Two states: Collect Payment (confirm in the footer), then Ride Completed. */}
        <View style={[styles.checkCircle, isPaid && styles.checkCirclePaid]}>
          {isPaid ? (
            <Check size={26} color="#FFFFFF" strokeWidth={3} />
          ) : isCash ? (
            <Banknote size={24} color="#FFFFFF" />
          ) : (
            <Smartphone size={24} color="#FFFFFF" />
          )}
        </View>
        <Text style={styles.title}>{isPaid ? 'Ride Completed' : 'Collect Payment'}</Text>
        {activeBooking && <Text style={styles.subtitle}>{activeBooking.passengerName}</Text>}

        {/* Fare hero */}
        <View style={styles.fareHero}>
          <Text style={styles.fareHeroLabel}>{isPaid ? 'Total Paid' : 'Total Fare to Collect'}</Text>
          <Text style={styles.fareHeroValue}>₱{totalFare.toFixed(2)}</Text>
          <Text style={styles.fareHeroBreakdown}>
            ₱{farePerPassenger.toFixed(2)} × {passengerCount} passenger{passengerCount !== 1 ? 's' : ''}
          </Text>
        </View>

        {/* Payment Details Container */}
        {isCash ? (
          /* CASH PAYMENT */
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Banknote size={18} color={COLORS.success} />
              <Text style={styles.cardTitle}>Cash Payment</Text>
              {isPaid && (
                <View style={styles.paidBadge}>
                  <CheckCircle2 size={13} color={COLORS.success} />
                  <Text style={styles.paidBadgeText}>Paid</Text>
                </View>
              )}
            </View>

            {isPaid ? (
              <View style={styles.paidInfoBox}>
                <Text style={styles.paidInfoText}>
                  Cash payment settled. Change given: ₱{(changeAmount ?? 0).toFixed(2)}.
                </Text>
              </View>
            ) : (
              <View style={styles.cashForm}>
                <Text style={styles.inputLabel}>AMOUNT RECEIVED</Text>
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

                {/* Quick denomination chips */}
                <View style={styles.quickCashRow}>
                  <TouchableOpacity
                    style={[styles.quickCashChip, amountNum === totalFare && styles.quickCashChipActive]}
                    onPress={() => handleQuickCash(totalFare)}
                  >
                    <Text style={[styles.quickCashText, amountNum === totalFare && styles.quickCashTextActive]}>
                      Exact (₱{totalFare.toFixed(0)})
                    </Text>
                  </TouchableOpacity>

                  {[50, 100, 200, 500].filter((amt) => amt > totalFare).map((amt) => (
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

                {/* Change calculation */}
                <View style={[styles.changeBox, isInsufficient ? styles.changeBoxError : styles.changeBoxSuccess]}>
                  <Text style={styles.changeLabel}>
                    {isInsufficient ? 'INSUFFICIENT AMOUNT' : 'CHANGE TO RETURN'}
                  </Text>
                  <Text style={[styles.changeValue, isInsufficient && styles.changeValueError]}>
                    {isInsufficient ? `Need ₱${(totalFare - amountNum).toFixed(2)} more` : `₱${liveChange.toFixed(2)}`}
                  </Text>
                </View>

              </View>
            )}
          </View>
        ) : (
          /* GCASH PAYMENT */
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Smartphone size={18} color={COLORS.primary} />
              <Text style={styles.cardTitle}>GCash Payment</Text>
              {isPaid ? (
                <View style={styles.paidBadge}>
                  <CheckCircle2 size={13} color={COLORS.success} />
                  <Text style={styles.paidBadgeText}>Paid</Text>
                </View>
              ) : (
                <View style={styles.neutralBadge}>
                  <Text style={styles.neutralBadgeText}>Awaiting Confirmation</Text>
                </View>
              )}
            </View>

            {isPaid ? (
              <View style={styles.paidInfoBox}>
                <Text style={styles.paidInfoText}>
                  GCash payment confirmed.{paymentReference ? ` Reference: ${paymentReference}` : ''}
                </Text>
              </View>
            ) : (
              <View style={styles.gcashForm}>
                <Text style={styles.instruction}>
                  Show this QR code to the passenger.
                </Text>

                {!gcashChecked ? (
                  <ActivityIndicator size="small" color={COLORS.primary} style={{ marginVertical: SPACING.md }} />
                ) : hasDriverQr && driverGcash?.gcash_qr_url ? (
                  <View style={styles.driverQrBox}>
                    <Image source={{ uri: driverGcash.gcash_qr_url }} style={styles.qrImage} resizeMode="contain" />
                    {driverGcash.gcash_name ? (
                      <Text style={styles.driverQrName}>{driverGcash.gcash_name}</Text>
                    ) : null}
                    {driverGcash.gcash_number ? (
                      <Text style={styles.driverQrNumber}>{driverGcash.gcash_number}</Text>
                    ) : null}
                  </View>
                ) : (
                  <View style={styles.warningBox}>
                    <AlertCircle size={16} color={COLORS.danger} />
                    <Text style={styles.warningText}>
                      No GCash QR configured in your Profile. You can still enter the reference number if the passenger paid directly to your mobile number.
                    </Text>
                  </View>
                )}

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>
                    Enter the GCash reference number provided by the passenger.
                  </Text>
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
    alignItems: 'center',
    padding: SPACING.lg,
    gap: SPACING.md,
  },
  checkCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkCirclePaid: {
    backgroundColor: COLORS.success,
  },
  title: {
    ...TYPOGRAPHY.h2,
    color: COLORS.textPrimary,
    marginTop: 2,
  },
  subtitle: {
    ...TYPOGRAPHY.body,
    color: COLORS.textSecondary,
  },
  fareHero: {
    alignItems: 'center',
    marginTop: SPACING.xs,
  },
  fareHeroLabel: {
    ...TYPOGRAPHY.label,
    color: COLORS.textMuted,
  },
  fareHeroValue: {
    ...TYPOGRAPHY.hero,
    color: COLORS.primary,
    marginTop: 2,
  },
  fareHeroBreakdown: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  card: {
    width: '100%',
    backgroundColor: COLORS.backgroundSubtle,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    gap: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardTitle: {
    ...TYPOGRAPHY.bodyLarge,
    fontWeight: '600',
    color: COLORS.textPrimary,
    flex: 1,
  },
  paidBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.successLight,
  },
  paidBadgeText: {
    ...TYPOGRAPHY.caption,
    fontWeight: '600',
    color: COLORS.success,
  },
  amberBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.amberLight,
  },
  amberBadgeText: {
    ...TYPOGRAPHY.caption,
    fontWeight: '600',
    color: COLORS.amberDark,
  },
  neutralBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  neutralBadgeText: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textMuted,
  },
  paidInfoBox: {
    padding: SPACING.sm + 2,
    backgroundColor: COLORS.successLight,
    borderRadius: RADIUS.md,
  },
  paidInfoText: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textPrimary,
    fontWeight: '500',
  },
  cashForm: {
    gap: SPACING.sm,
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
  currencyPrefix: {
    ...TYPOGRAPHY.h2,
    color: COLORS.textPrimary,
    marginRight: 6,
  },
  amountInput: {
    flex: 1,
    ...TYPOGRAPHY.h2,
    color: COLORS.textPrimary,
    paddingVertical: SPACING.xs + 4,
  },
  quickCashRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.xs + 2,
    marginVertical: 2,
  },
  quickCashChip: {
    paddingHorizontal: SPACING.sm + 4,
    paddingVertical: 4,
    borderRadius: RADIUS.sm,
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
    borderRadius: RADIUS.md,
    padding: SPACING.sm + 4,
    borderWidth: 1,
    marginVertical: 2,
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
    ...TYPOGRAPHY.h3,
    color: COLORS.success,
    marginTop: 2,
  },
  changeValueError: {
    color: COLORS.danger,
  },
  gcashForm: {
    gap: SPACING.md,
  },
  instruction: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textSecondary,
    lineHeight: 18,
  },
  driverQrBox: {
    alignItems: 'center',
    backgroundColor: COLORS.surfaceInput,
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
    width: '100%',
    gap: SPACING.xs,
  },
  textInput: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs + 4,
    ...TYPOGRAPHY.bodySmall,
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

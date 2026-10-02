import React from 'react';
import { View, Text, StyleSheet, Modal, ScrollView, Pressable, Image, Platform } from 'react-native';
import { COLORS, RADIUS, SHADOWS, SPACING, TYPOGRAPHY } from '../constants/theme';
import { useDriverShift } from '../context/DriverShiftContext';
import { ViolationCitation } from '../types';
import { X, CheckCircle2, Clock3, Banknote } from 'lucide-react-native';
import StatusBadge, { BadgeTone } from './StatusBadge';
import FloatingIconButton from './FloatingIconButton';
import AppealFormFields, { ProofPhoto } from './AppealFormFields';

/** One tone per real lifecycle state (shared with the Violations list): an appeal under review is
 * amber, not red — the fine isn't outstanding while it's being reviewed. */
export function violationTone(v: ViolationCitation): BadgeTone {
  switch (v.driverStatus) {
    case 'resolved': return 'success';
    case 'appeal_under_review': return 'warning';
    default: return 'danger';
  }
}

interface ViolationDetailModalProps {
  visible: boolean;
  violation: ViolationCitation | null;
  onClose: () => void;
}

/**
 * Shows the real violation record plus, when one exists, its appeal. While the violation is
 * still eligible for appeal, the appeal form itself renders inline in the "Appeal This
 * Violation" section below — never as a separate modal — so the violation stays visible the
 * whole time the driver is preparing it. Once an appeal exists, this section is replaced by the
 * matching read-only status panel for whatever the appeal's current status is.
 */
export default function ViolationDetailModal({ visible, violation, onClose }: ViolationDetailModalProps) {
  const { submitViolationAppeal } = useDriverShift();

  if (!violation) return null;
  const isResolved = violation.status === 'resolved';
  const appeal = violation.appeal;
  const tone = violationTone(violation);

  const handleAppealSubmit = (reason: string, proof?: ProofPhoto) =>
    submitViolationAppeal(violation.id, reason, proof);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        {/* Tap outside the sheet to close */}
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close violation details" />

        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <View style={styles.flex}>
              <Text style={styles.title}>Violation Details</Text>
              <Text style={styles.headerSub}>{violation.citationNo}</Text>
            </View>
            <FloatingIconButton size={36} onPress={onClose} accessibilityLabel="Close" style={styles.closeButton}>
              <X size={18} color={COLORS.textPrimary} />
            </FloatingIconButton>
          </View>

          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            {/* The fine and where it stands, first */}
            <View style={styles.hero}>
              <Text style={styles.heroLabel}>{isResolved ? 'Fine' : 'Fine due'}</Text>
              <Text style={[styles.heroAmount, isResolved && styles.heroAmountSettled]}>₱{violation.fine.toFixed(2)}</Text>
              <StatusBadge label={violation.driverStatusLabel} tone={tone} style={styles.heroBadge} />
            </View>

            <Text style={styles.violationTitle}>{violation.title}</Text>
            <Text style={styles.violationDesc}>{violation.description}</Text>

            <Text style={styles.sectionLabel}>Details</Text>
            <DetailRow label="Citation no." value={violation.citationNo} />
            <DetailRow label="Date" value={violation.date} />
            <DetailRow label="Type" value={violation.type} />
            {violation.location && (
              <DetailRow
                label="Location"
                value={`${violation.location.latitude.toFixed(5)}, ${violation.location.longitude.toFixed(5)}`}
              />
            )}

            {/* Divider only when an appeal form or appeal status follows */}
            {(appeal || violation.canAppeal) && <View style={styles.divider} />}

            {/* ── Appeal lifecycle panel ─────────────────────────────────────── */}
            {!appeal && violation.canAppeal && (
              <View style={styles.appealSection}>
                <Text style={styles.appealLabel}>Appeal this violation</Text>
                <Text style={styles.sectionHint}>
                  If this was recorded in error, or you were responding to a genuine emergency, explain what
                  happened below. Appeals are reviewed by the TMO office.
                </Text>
                <AppealFormFields key={violation.id} onSubmit={handleAppealSubmit} />
              </View>
            )}

            {appeal && appeal.status === 'under_review' && (
              <View style={[styles.statusPanel, styles.statusPanelReview]}>
                <Clock3 size={18} color={COLORS.amber} />
                <View style={styles.statusPanelTextCol}>
                  <Text style={styles.statusPanelTitle}>Appeal Under Review</Text>
                  <Text style={styles.statusPanelBody}>
                    Your appeal was submitted on {formatDate(appeal.submittedAt)} and is being reviewed by the
                    TMO office. You'll be notified once a decision is made.
                  </Text>
                </View>
              </View>
            )}

            {appeal && appeal.status === 'approved' && (
              <View style={[styles.statusPanel, styles.statusPanelApproved]}>
                <CheckCircle2 size={18} color={COLORS.success} />
                <View style={styles.statusPanelTextCol}>
                  <Text style={styles.statusPanelTitle}>Appeal Approved</Text>
                  <Text style={styles.statusPanelBody}>
                    Violation Resolved — no further action is needed on your part.
                    {appeal.reviewedAt ? ` Reviewed on ${formatDate(appeal.reviewedAt)}.` : ''}
                    {appeal.reviewNotes ? `\n\nReviewer note: "${appeal.reviewNotes}"` : ''}
                  </Text>
                </View>
              </View>
            )}

            {appeal && appeal.status === 'rejected' && (
              <View style={[styles.statusPanel, styles.statusPanelRejected]}>
                <Banknote size={18} color={COLORS.dangerDark} />
                <View style={styles.statusPanelTextCol}>
                  <Text style={styles.statusPanelTitle}>Appeal Not Approved</Text>
                  <Text style={styles.statusPanelBody}>
                    Fine Payment Required. Please pay ₱{violation.fine.toFixed(2)} at the cashier.
                    {appeal.reviewedAt ? ` Reviewed on ${formatDate(appeal.reviewedAt)}.` : ''}
                    {appeal.reviewNotes ? `\n\nReviewer note: "${appeal.reviewNotes}"` : ''}
                  </Text>
                </View>
              </View>
            )}

            {appeal && (
              <View style={styles.appealRecap}>
                <Text style={styles.appealRecapLabel}>Your appeal</Text>
                <Text style={styles.appealRecapReason}>"{appeal.reason}"</Text>
                {appeal.evidenceUrl && (
                  <Image source={{ uri: appeal.evidenceUrl }} style={styles.appealEvidence} />
                )}
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function formatDate(iso: string | null): string {
  if (!iso) return 'recently';
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return 'recently';
  }
}

function DetailRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[styles.detailRow, last && styles.detailRowLast]}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'flex-end',
  },
  flex: { flex: 1 },
  sheet: {
    backgroundColor: COLORS.background,
    borderTopLeftRadius: RADIUS.xxl,
    borderTopRightRadius: RADIUS.xxl,
    maxHeight: '90%',
    ...SHADOWS.sheet,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.border,
    marginTop: SPACING.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.sm + 2,
    paddingBottom: SPACING.sm,
  },
  title: {
    ...TYPOGRAPHY.h2,
    color: COLORS.textPrimary,
  },
  headerSub: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textMuted,
    marginTop: 1,
  },
  closeButton: {
    backgroundColor: COLORS.backgroundSubtle,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    shadowOpacity: 0,
    elevation: 0,
  },
  content: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.xs,
    paddingBottom: Platform.OS === 'ios' ? 34 : SPACING.lg,
  },
  hero: {
    alignItems: 'center',
    gap: 6,
    paddingVertical: SPACING.lg,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.backgroundSubtle,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  heroLabel: {
    ...TYPOGRAPHY.label,
    color: COLORS.textMuted,
  },
  heroAmount: {
    ...TYPOGRAPHY.hero,
    color: COLORS.textPrimary,
  },
  heroBadge: {
    alignSelf: 'center',
  },
  heroAmountSettled: {
    color: COLORS.textSecondary,
  },
  violationTitle: {
    ...TYPOGRAPHY.h2,
    color: COLORS.textPrimary,
    marginTop: SPACING.lg,
  },
  violationDesc: {
    ...TYPOGRAPHY.body,
    color: COLORS.textSecondary,
    marginTop: 4,
  },
  sectionLabel: {
    ...TYPOGRAPHY.label,
    color: COLORS.textMuted,
    marginTop: SPACING.lg,
    marginBottom: SPACING.xs,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.borderLight,
    marginVertical: SPACING.md,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: SPACING.md,
    minHeight: 40,
  },
  detailRowLast: {},
  detailLabel: {
    ...TYPOGRAPHY.body,
    color: COLORS.textSecondary,
  },
  detailValue: {
    ...TYPOGRAPHY.body,
    fontWeight: '600',
    color: COLORS.textPrimary,
    flexShrink: 1,
    textAlign: 'right',
  },
  appealSection: {
    backgroundColor: COLORS.backgroundSubtle,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    padding: SPACING.md,
  },
  appealLabel: {
    ...TYPOGRAPHY.h3,
    color: COLORS.textPrimary,
  },
  sectionHint: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textSecondary,
    lineHeight: 18,
    marginTop: 6,
    marginBottom: SPACING.sm,
  },
  statusPanel: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    borderWidth: 1,
  },
  statusPanelReview: {
    backgroundColor: COLORS.amberLight,
    borderColor: 'rgba(217,119,6,0.25)',
  },
  statusPanelApproved: {
    backgroundColor: COLORS.successLight,
    borderColor: COLORS.successBorder,
  },
  statusPanelRejected: {
    backgroundColor: COLORS.dangerLight,
    borderColor: COLORS.dangerBorder,
  },
  statusPanelTextCol: {
    flex: 1,
  },
  statusPanelTitle: {
    ...TYPOGRAPHY.body,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  statusPanelBody: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textSecondary,
    lineHeight: 18,
    marginTop: 3,
  },
  appealRecap: {
    marginTop: SPACING.md,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
  },
  appealRecapLabel: {
    ...TYPOGRAPHY.label,
    color: COLORS.textMuted,
    marginBottom: 6,
  },
  appealRecapReason: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textPrimary,
    lineHeight: 18,
    fontStyle: 'italic',
  },
  appealEvidence: {
    width: '100%',
    height: 160,
    borderRadius: RADIUS.md,
    marginTop: SPACING.sm,
    backgroundColor: COLORS.backgroundSubtle,
  },
});

import React from 'react';
import { View, Text, StyleSheet, Modal, ScrollView, TouchableOpacity, Image, Platform } from 'react-native';
import { COLORS, RADIUS, SHADOWS, SPACING, TYPOGRAPHY } from '../constants/theme';
import { useDriverShift } from '../context/DriverShiftContext';
import { ViolationCitation } from '../types';
import { X, AlertOctagon, CheckCircle2, Clock3, Banknote } from 'lucide-react-native';
import StatusBadge from './StatusBadge';
import AppealFormFields, { ProofPhoto } from './AppealFormFields';

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

  const handleAppealSubmit = (reason: string, proof?: ProofPhoto) =>
    submitViolationAppeal(violation.id, reason, proof);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>Violation Details</Text>
            <TouchableOpacity style={styles.closeButton} onPress={onClose} activeOpacity={0.7}>
              <X size={20} color={COLORS.textPrimary} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.content}>
            <View style={styles.citationRow}>
              <View style={styles.citationLeft}>
                {isResolved ? (
                  <CheckCircle2 size={16} color={COLORS.success} />
                ) : (
                  <AlertOctagon size={16} color={COLORS.dangerDark} />
                )}
                <Text style={styles.citationNo}>{violation.citationNo}</Text>
              </View>
              <StatusBadge
                label={violation.driverStatusLabel}
                tone={isResolved ? 'success' : 'danger'}
                size="sm"
              />
            </View>

            <Text style={styles.violationTitle}>{violation.title}</Text>
            <Text style={styles.violationDesc}>{violation.description}</Text>

            <View style={styles.divider} />

            <DetailRow label="Date" value={violation.date} />
            <DetailRow label="Type" value={violation.type} />
            {violation.location && (
              <DetailRow
                label="Location"
                value={`${violation.location.latitude.toFixed(5)}, ${violation.location.longitude.toFixed(5)}`}
              />
            )}
            <DetailRow label="Fine Amount" value={`₱${violation.fine.toFixed(2)}`} last />

            <View style={styles.divider} />

            {/* ── Appeal lifecycle panel ─────────────────────────────────────── */}
            {!appeal && violation.canAppeal && (
              <View style={styles.appealSection}>
                <Text style={styles.sectionLabel}>APPEAL THIS VIOLATION</Text>
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
                <Text style={styles.appealRecapLabel}>Your Appeal</Text>
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
  sheet: {
    backgroundColor: COLORS.background,
    borderTopLeftRadius: RADIUS.xxl,
    borderTopRightRadius: RADIUS.xxl,
    maxHeight: '88%',
    ...SHADOWS.sheet,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  title: {
    ...TYPOGRAPHY.h3,
    color: COLORS.textPrimary,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.backgroundSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    padding: SPACING.lg,
    paddingBottom: Platform.OS === 'ios' ? 34 : SPACING.lg,
  },
  citationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  citationLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  citationNo: {
    ...TYPOGRAPHY.caption,
    fontWeight: '900',
    color: COLORS.primary,
  },
  violationTitle: {
    ...TYPOGRAPHY.h2,
    color: COLORS.textPrimary,
    marginTop: SPACING.sm,
  },
  violationDesc: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textSecondary,
    lineHeight: 18,
    marginTop: 4,
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
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  detailRowLast: {
    borderBottomWidth: 0,
  },
  detailLabel: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textSecondary,
  },
  detailValue: {
    ...TYPOGRAPHY.caption,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  appealSection: {
    backgroundColor: COLORS.backgroundSubtle,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
  },
  sectionLabel: {
    ...TYPOGRAPHY.label,
    color: COLORS.textMuted,
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
    fontWeight: '800',
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

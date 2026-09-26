import { RideHistoryItem } from '../types';

/**
 * The real Date of a ride record, for date-range math. Uses the ISO `timestamp` (always parseable)
 * and only falls back to the display `date` string for records that predate it (e.g. the local
 * demo seed), where an unparseable string yields an Invalid Date that simply matches no range.
 */
export function rideDate(item: RideHistoryItem): Date {
  return item.timestamp ? new Date(item.timestamp) : new Date(item.date);
}

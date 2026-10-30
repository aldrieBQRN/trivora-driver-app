import Constants from 'expo-constants';

/**
 * Trivora's official contact details: the same ones the public website's "Contact the TMO" section
 * publishes (trivora/resources/js/Pages/Welcome.jsx). Same file in the Passenger app; keep the
 * website and both apps in sync when any of them changes.
 */
export const TMO_CONTACT = {
  office: 'Traffic Management Office (TMO)',
  address: 'Municipal Hall, J. P. Laurel Street, Nasugbu, Batangas 4231',
  hotline: '(043) 740-8112',
  email: 'tmo@nasugbu.gov.ph',
  officeHours: 'Monday to Friday, 8:00 AM to 5:00 PM',
  inspectionHours: 'Monday to Friday, 8:30 AM to 4:00 PM',
  closed: 'Weekends and official holidays',
};

export const ABOUT_TRIVORA =
  'Trivora is the official tricycle regulatory and franchise management system of the Municipality of Nasugbu, Batangas, run by its Traffic Management Office.';

/** This build's version, from app.json. */
export const APP_VERSION = Constants.expoConfig?.version ?? '1.0.0';

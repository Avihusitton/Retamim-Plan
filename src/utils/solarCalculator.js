/**
 * Calculates the solar position (azimuth and elevation) for a given latitude, day of year, and solar hour.
 * 
 * @param {number} latitude - Latitude in degrees (-90 to 90)
 * @param {number} dayOfYear - Day of the year (1 to 365)
 * @param {number} hour - Solar hour of the day (0 to 24)
 * @returns {object} { elevation: degrees, azimuth: degrees }
 */
export const getSunPosition = (latitude, dayOfYear, hour) => {
  // Convert latitude to radians
  const latRad = latitude * Math.PI / 180;
  
  // Declination (angle of the sun relative to the earth's equator)
  // Declination is roughly between -23.45 and +23.45 degrees
  const declination = 23.45 * Math.sin((360 / 365) * (dayOfYear - 80) * Math.PI / 180) * Math.PI / 180;
  
  // Hour angle (0 at solar noon, negative in morning, positive in afternoon)
  // 15 degrees per hour
  const hourAngle = (hour - 12) * 15 * Math.PI / 180;
  
  // Elevation (altitude) angle: angle above the horizon [-90, 90]
  const sinElevation = Math.sin(latRad) * Math.sin(declination) + Math.cos(latRad) * Math.cos(declination) * Math.cos(hourAngle);
  // Clamp sinElevation to [-1, 1] to prevent NaN due to rounding issues
  const clampedSin = Math.max(-1, Math.min(1, sinElevation));
  const elevation = Math.asin(clampedSin);
  
  // Azimuth angle: angle from North (clockwise, [0, 360])
  const cosElevation = Math.cos(elevation);
  const cosElev = Math.max(1e-6, cosElevation); // avoid division by zero
  
  const cosAzimuth = (Math.sin(declination) * Math.cos(latRad) - Math.cos(declination) * Math.sin(latRad) * Math.cos(hourAngle)) / cosElev;
  const sinAzimuth = (-Math.cos(declination) * Math.sin(hourAngle)) / cosElev;
  
  let azimuth = Math.atan2(sinAzimuth, cosAzimuth);
  if (azimuth < 0) azimuth += 2 * Math.PI;
  
  return {
    elevation: elevation * 180 / Math.PI, // elevation in degrees
    azimuth: azimuth * 180 / Math.PI,     // azimuth in degrees
  };
};

/**
 * Returns the name of a month in Hebrew.
 */
export const getHebrewMonthName = (monthNum) => {
  const months = [
    'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 
    'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'
  ];
  return months[monthNum - 1] || '';
};

/**
 * Calculates day of the year from month (1 to 12)
 */
export const getDayOfYearForMonth = (month) => {
  const monthDays = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let days = 0;
  for (let i = 1; i < month; i++) {
    days += monthDays[i];
  }
  return days + 15; // return middle of the month
};

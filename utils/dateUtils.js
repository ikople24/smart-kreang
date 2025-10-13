/**
 * Utility functions for date handling
 */

/**
 * Safely format a date string to Thai locale
 * @param {string|Date|null|undefined} dateInput - The date to format
 * @param {Object} options - Intl.DateTimeFormat options
 * @returns {string} Formatted date string or fallback text
 */
export const formatDate = (dateInput, options = {}) => {
  // Return fallback if no date input
  if (!dateInput) return 'ไม่ระบุ';
  
  // Handle different input types
  let date;
  if (typeof dateInput === 'string') {
    // Handle empty string
    if (dateInput.trim() === '') return 'ไม่ระบุ';
    date = new Date(dateInput);
  } else if (dateInput instanceof Date) {
    date = dateInput;
  } else {
    return 'ไม่ระบุ';
  }
  
  // Check if date is valid
  if (isNaN(date.getTime())) return 'ไม่ระบุ';
  
  // Default options for Thai locale
  const defaultOptions = {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    ...options
  };
  
  return date.toLocaleDateString('th-TH', defaultOptions);
};

/**
 * Format date for display in cards (shorter format)
 * @param {string|Date|null|undefined} dateInput - The date to format
 * @returns {string} Formatted date string
 */
export const formatDateShort = (dateInput) => {
  return formatDate(dateInput, {
    year: '2-digit',
    month: 'short',
    day: 'numeric'
  });
};

/**
 * Format date for display in tables
 * @param {string|Date|null|undefined} dateInput - The date to format
 * @returns {string} Formatted date string
 */
export const formatDateTable = (dateInput) => {
  return formatDate(dateInput, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
};

/**
 * Get days since a given date
 * @param {string|Date|null|undefined} dateInput - The date to calculate from
 * @returns {string} Days since text
 */
export const getDaysSince = (dateInput) => {
  if (!dateInput) return 'ไม่ระบุ';
  
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) return 'ไม่ระบุ';
  
  const days = Math.floor((new Date() - date) / (1000 * 60 * 60 * 24));
  
  if (days === 0) return "วันนี้";
  if (days === 1) return "เมื่อวาน";
  return `${days} วันที่แล้ว`;
};

/**
 * Validate if a date string is valid
 * @param {string|Date|null|undefined} dateInput - The date to validate
 * @returns {boolean} True if valid date
 */
export const isValidDate = (dateInput) => {
  if (!dateInput) return false;
  
  const date = new Date(dateInput);
  return !isNaN(date.getTime());
};

/**
 * Create a safe Date object with fallback
 * @param {string|Date|null|undefined} dateInput - The date input
 * @param {Date} fallback - Fallback date if input is invalid
 * @returns {Date} Valid Date object
 */
export const safeDate = (dateInput, fallback = new Date()) => {
  if (!dateInput) return fallback;
  
  const date = new Date(dateInput);
  return isNaN(date.getTime()) ? fallback : date;
};

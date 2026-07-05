import React from 'react';

interface BrandIconProps {
  size?: number;
  className?: string;
}

export const IconGoogleDrive = ({ size = 18, className = '' }: BrandIconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
    <path d="M8.5 4.5H15.5L22 15.5H15L8.5 4.5Z" fill="#0066DA" />
    <path d="M15.5 4.5L12 11L5.5 22L2 15.5L8.5 4.5Z" fill="#00AC47" />
    <path d="M15.5 15.5H22L18.5 22H5.5L15.5 15.5Z" fill="#FFBA00" />
    <path d="M12 11L15.5 15.5H8.5L12 11Z" fill="#2A83F1" />
  </svg>
);

export const IconDropbox = ({ size = 18, className = '' }: BrandIconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="#0061FF" className={className}>
    <path d="M6 2L1 5.3L6 8.7L11 5.3L6 2Z" />
    <path d="M18 2L13 5.3L18 8.7L23 5.3L18 2Z" />
    <path d="M1 12L6 15.3L11 12L6 8.7L1 12Z" />
    <path d="M23 12L18 15.3L13 12L18 8.7L23 12Z" />
    <path d="M6 15.3L11 18.7L16 15.3L11 12L6 15.3Z" />
    <path d="M11 18.7V22L6 18.7V15.3L11 18.7Z" />
    <path d="M11 18.7V22L16 18.7V15.3L11 18.7Z" />
  </svg>
);

export const IconOneDrive = ({ size = 18, className = '' }: BrandIconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="#0078D4" className={className}>
    <path d="M16.5 18C14.0147 18 12 15.9853 12 13.5C12 13.4116 12.0026 13.3238 12.0076 13.2367C11.5315 13.0841 11.0253 13 10.5 13C8.01472 13 6 15.0147 6 17.5C6 19.9853 8.01472 22 10.5 22H16.5C18.9853 22 21 19.9853 21 17.5C21 15.0147 18.9853 13 16.5 13C16.3475 13 16.1973 13.0076 16.0494 13.0223C15.5786 11.8315 14.4175 11 13.05 11C11.3655 11 10 12.3655 10 14.05C10 14.1561 10.0054 14.2609 10.0159 14.364C9.17647 14.129 8.28122 14 7.35 14C4.39528 14 2 16.3953 2 19.35C2 22.3047 4.39528 24.7 7.35 24.7H16.5C19.8137 24.7 22.5 22.0137 22.5 18.7C22.5 15.3863 19.8137 12.7 16.5 12.7V18Z" />
  </svg>
);

export const IconBox = ({ size = 18, className = '' }: BrandIconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="#0061D5" className={className}>
    <path d="M12 2L2 7V17L12 22L22 17V7L12 2Z" fill="none" stroke="currentColor" strokeWidth="2" />
    <path d="M12 22V12" stroke="currentColor" strokeWidth="2" />
    <path d="M22 7L12 12L2 7" stroke="currentColor" strokeWidth="2" />
    <path d="M17 4.5L7 9.5" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.5" />
  </svg>
);

import React from 'react';

type CieloIconProps = Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src' | 'alt'> & {
  label?: string;
};

const CieloIcon: React.FC<CieloIconProps> = ({ className, label, ...props }) => (
  <img
    src="/cielo-icon.svg"
    alt={label ?? ''}
    aria-hidden={label ? undefined : true}
    className={className}
    draggable={false}
    {...props}
  />
);

export default CieloIcon;

import { useState } from 'react';
import IconButton from '@mui/joy/IconButton';
import Input, { type InputProps } from '@mui/joy/Input';
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';

export function PasswordField({
  value,
  onChange,
  placeholder,
  autoComplete,
  name,
  required,
  disabled,
  size,
  sx,
  slotProps,
  ...rest
}: Omit<InputProps, 'type' | 'endDecorator'>) {
  const [visible, setVisible] = useState(false);

  return (
    <Input
      {...rest}
      type={visible ? 'text' : 'password'}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      autoComplete={autoComplete}
      name={name}
      required={required}
      disabled={disabled}
      size={size}
      sx={sx}
      slotProps={slotProps}
      endDecorator={
        <IconButton
          variant="plain"
          color="neutral"
          size="sm"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Hide password' : 'Show password'}
          tabIndex={-1}
        >
          {visible ? <VisibilityOff /> : <Visibility />}
        </IconButton>
      }
    />
  );
}

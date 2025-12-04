import React, { useState, useEffect } from 'react';
import ReactSelect, { StylesConfig, GroupBase } from 'react-select';

interface SelectOption {
  value: number | string;
  label: string;
}

interface SelectProps {
  id?: string;
  value: number | string;
  onChange: (value: number | string) => void;
  options: SelectOption[];
  className?: string;
}

// Hook to detect dark mode
function useDarkMode() {
  const [isDark, setIsDark] = useState(
    document.documentElement.classList.contains('dark'),
  );

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains('dark'));
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });

    return () => observer.disconnect();
  }, []);

  return isDark;
}

// Light theme colors
const lightColors = {
  bg: '#effdfb',
  border: 'rgba(0, 77, 64, 0.2)',
  borderFocus: '#26a69a',
  text: '#004d40',
  textSoft: '#00796b',
  accent: '#26a69a',
  shadow: 'rgba(0, 77, 64, 0.15)',
};

// Dark theme colors (forest theme)
const darkColors = {
  bg: '#294936',
  border: 'white',
  borderFocus: 'hsl(157, 58%, 56%)',
  text: 'hsl(120, 25%, 87%)',
  textSoft: 'hsl(120, 16%, 66%)',
  accent: 'hsl(157, 58%, 56%)',
  shadow: 'hsla(120, 100%, 4%, 0.5)',
};

// Custom styles factory to support dark mode
const getCustomStyles = (
  isDark: boolean,
): StylesConfig<SelectOption, false, GroupBase<SelectOption>> => {
  const colors = isDark ? darkColors : lightColors;

  return {
    control: (provided, state) => ({
      ...provided,
      backgroundColor: colors.bg,
      borderColor: state.isFocused ? colors.borderFocus : colors.border,
      borderRadius: '6px',
      minHeight: '36px',
      boxShadow: state.isFocused ? `0 0 0 1px ${colors.borderFocus}` : 'none',
      '&:hover': {
        borderColor: colors.borderFocus,
      },
      cursor: 'pointer',
    }),
    valueContainer: (provided) => ({
      ...provided,
      padding: '2px 12px',
    }),
    singleValue: (provided) => ({
      ...provided,
      color: colors.text,
      fontFamily: '"Segoe UI", system-ui, sans-serif',
      fontSize: '14px',
    }),
    placeholder: (provided) => ({
      ...provided,
      color: colors.textSoft,
    }),
    input: (provided) => ({
      ...provided,
      color: colors.text,
    }),
    menu: (provided) => ({
      ...provided,
      backgroundColor: colors.bg,
      borderRadius: '6px',
      border: `1px solid ${colors.border}`,
      boxShadow: `0 8px 24px ${colors.shadow}`,
      zIndex: 9999,
      overflow: 'hidden',
    }),
    menuList: (provided) => ({
      ...provided,
      padding: '4px',
    }),
    menuPortal: (provided) => ({
      ...provided,
      zIndex: 9999,
    }),
    option: (provided, state) => {
      const focusBg = isDark
        ? 'hsla(157, 58%, 56%, 0.15)'
        : 'rgba(38, 166, 154, 0.1)';
      let backgroundColor = 'transparent';
      if (state.isSelected) {
        backgroundColor = colors.accent;
      } else if (state.isFocused) {
        backgroundColor = focusBg;
      }
      return {
        ...provided,
        backgroundColor,
        color: state.isSelected ? '#ffffff' : colors.text,
        fontFamily: '"Segoe UI", system-ui, sans-serif',
        fontSize: '14px',
        padding: '8px 12px',
        borderRadius: '4px',
        cursor: 'pointer',
        '&:active': {
          backgroundColor: colors.accent,
        },
      };
    },
    indicatorSeparator: () => ({
      display: 'none',
    }),
    dropdownIndicator: (provided, state) => ({
      ...provided,
      color: state.isFocused ? colors.borderFocus : colors.textSoft,
      padding: '8px',
      '&:hover': {
        color: colors.borderFocus,
      },
    }),
  };
};

export function Select({
  id,
  value,
  onChange,
  options,
  className,
}: SelectProps): React.ReactElement {
  const isDark = useDarkMode();
  const selectedOption =
    options.find((opt) => opt.value === value) || options[0];

  return (
    <ReactSelect<SelectOption, false>
      inputId={id}
      value={selectedOption}
      onChange={(option) => {
        if (option) {
          onChange(option.value);
        }
      }}
      options={options}
      styles={getCustomStyles(isDark)}
      className={className}
      isSearchable={false}
      menuPortalTarget={document.body}
      menuPlacement="auto"
    />
  );
}

// Provide defaultProps for optional props to satisfy prop-type/defaultProps lint rule
Select.defaultProps = {
  id: undefined,
  className: undefined,
};

export default Select;

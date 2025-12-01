import React from 'react';
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

// Custom styles to match the existing launcher theme
const customStyles: StylesConfig<
  SelectOption,
  false,
  GroupBase<SelectOption>
> = {
  control: (provided, state) => ({
    ...provided,
    backgroundColor: '#f6ffff',
    borderColor: state.isFocused ? '#26a69a' : 'rgba(0, 77, 64, 0.2)',
    borderRadius: '6px',
    minHeight: '36px',
    boxShadow: state.isFocused ? '0 0 0 1px #26a69a' : 'none',
    '&:hover': {
      borderColor: '#26a69a',
    },
    cursor: 'pointer',
  }),
  valueContainer: (provided) => ({
    ...provided,
    padding: '2px 12px',
  }),
  singleValue: (provided) => ({
    ...provided,
    color: '#004d40',
    fontFamily: '"Segoe UI", system-ui, sans-serif',
    fontSize: '14px',
  }),
  placeholder: (provided) => ({
    ...provided,
    color: '#00796b',
  }),
  input: (provided) => ({
    ...provided,
    color: '#004d40',
  }),
  menu: (provided) => ({
    ...provided,
    backgroundColor: '#f6ffff',
    borderRadius: '6px',
    border: '1px solid rgba(0, 77, 64, 0.2)',
    boxShadow: '0 8px 24px rgba(0, 77, 64, 0.15)',
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
  option: (provided, state) => ({
    ...provided,
    backgroundColor: state.isSelected
      ? '#26a69a'
      : state.isFocused
        ? 'rgba(38, 166, 154, 0.1)'
        : 'transparent',
    color: state.isSelected ? '#ffffff' : '#004d40',
    fontFamily: '"Segoe UI", system-ui, sans-serif',
    fontSize: '14px',
    padding: '8px 12px',
    borderRadius: '4px',
    cursor: 'pointer',
    '&:active': {
      backgroundColor: '#26a69a',
    },
  }),
  indicatorSeparator: () => ({
    display: 'none',
  }),
  dropdownIndicator: (provided, state) => ({
    ...provided,
    color: state.isFocused ? '#26a69a' : '#00796b',
    padding: '8px',
    '&:hover': {
      color: '#26a69a',
    },
  }),
};

export const Select: React.FC<SelectProps> = ({
  id,
  value,
  onChange,
  options,
  className,
}) => {
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
      styles={customStyles}
      className={className}
      isSearchable={false}
      menuPortalTarget={document.body}
      menuPosition="fixed"
    />
  );
};

export default Select;

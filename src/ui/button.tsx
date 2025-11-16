import React from 'react';
import { LauncherState, getButtonLabel } from '../logic/state';

interface Props {
  state: LauncherState;
  onClick: () => void;
  // eslint-disable-next-line react/require-default-props
  disabled?: boolean;
}

function LauncherButton({ state, onClick, disabled = false }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || state === 'downloading' || state === 'updating'}
    >
      {getButtonLabel(state)}
    </button>
  );
}

export default LauncherButton;

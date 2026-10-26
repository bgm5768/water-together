import { useRef } from 'react';
import { MAX_DRINK_ML } from '../../shared/types';
import { AmountSheet } from './AmountSheet';

interface Props {
  initialAmount: number;
  online: boolean;
  onClose: () => void;
  onSave: (amount: number, when: string, key: string) => Promise<void>;
}

export function DrinkSheet({ initialAmount, online, onClose, onSave }: Props) {
  const request = useRef<{ amount: number; when: string; key: string } | null>(null);
  return (
    <AmountSheet
      initialAmount={initialAmount}
      min={1}
      max={MAX_DRINK_ML}
      title="얼마나 마셨나요?"
      label="마신 물의 양"
      caption="나를 위한 한 잔"
      footer="처음 표시되는 용량은 내 설정에서 바꿀 수 있어요."
      recording
      online={online}
      onClose={onClose}
      onSave={async (amount) => {
        // Keep the timestamp and idempotency key when retrying an uncertain response.
        if (!request.current || request.current.amount !== amount)
          request.current = { amount, when: new Date().toISOString(), key: crypto.randomUUID() };
        await onSave(request.current.amount, request.current.when, request.current.key);
      }}
    />
  );
}

import { useEffect, useState } from 'react';
import { Check, Copy } from 'lucide-react';

export function CodeBox({
  label,
  value,
  onError,
}: {
  label: string;
  value: string;
  onError: (message: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  useEffect(() => setCopied(false), [value]);
  return (
    <div className="code-box">
      <label>
        {label}
        <textarea readOnly value={value} rows={2} />
      </label>
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            onError('');
          } catch {
            onError('자동 복사에 실패했어요. 코드를 선택해서 직접 복사해 주세요.');
          }
        }}
      >
        {copied ? <Check size={16} /> : <Copy size={16} />} {copied ? '복사됨' : '복사'}
      </button>
    </div>
  );
}

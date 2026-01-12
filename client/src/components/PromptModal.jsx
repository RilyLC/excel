import React, { useState, useEffect } from 'react';
import Modal from './Modal';

export default function PromptModal({ isOpen, onClose, onConfirm, title, message, placeholder = '', defaultValue = '', inputType = 'text' }) {
  const [value, setValue] = useState(defaultValue);

  useEffect(() => {
    if (isOpen) setValue(defaultValue);
  }, [isOpen, defaultValue]);

  const handleConfirm = () => {
    onConfirm(value);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      footer={
        <>
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleConfirm}
            disabled={!value.trim()}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            确定
          </button>
        </>
      }
    >
      {message && <p className="text-sm text-gray-600 mb-4">{message}</p>}
      <input
        type={inputType}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
        autoFocus
        onKeyDown={(e) => {
            if (e.key === 'Enter' && value.trim()) {
                handleConfirm();
            }
        }}
      />
    </Modal>
  );
}

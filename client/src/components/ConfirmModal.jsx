import React from 'react';
import Modal from './Modal';
import { AlertCircle, HelpCircle, CheckCircle } from 'lucide-react';

export default function ConfirmModal({ isOpen, onClose, onConfirm, title, message, children, confirmText = '确定', cancelText = '取消', type = 'warning' }) {
  const handleConfirm = () => {
    onConfirm();
    onClose();
  };

  const icons = {
    warning: <AlertCircle className="text-amber-500" size={24} />,
    danger: <AlertCircle className="text-red-500" size={24} />,
    info: <HelpCircle className="text-blue-500" size={24} />,
    success: <CheckCircle className="text-green-500" size={24} />
  };

  const confirmBtnClasses = {
    warning: 'bg-amber-600 hover:bg-amber-700 focus:ring-amber-500',
    danger: 'bg-red-600 hover:bg-red-700 focus:ring-red-500',
    info: 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500',
    success: 'bg-green-600 hover:bg-green-700 focus:ring-green-500'
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
            {cancelText}
          </button>
          <button
            onClick={handleConfirm}
            className={`px-4 py-2 text-sm font-medium text-white border border-transparent rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 shadow-sm transition-colors ${confirmBtnClasses[type] || confirmBtnClasses.info}`}
          >
            {confirmText}
          </button>
        </>
      }
    >
      <div className="flex gap-4">
        <div className="flex-shrink-0 mt-1">
          {icons[type] || icons.info}
        </div>
        <div className="flex-1">
          {message && <p className="text-sm text-gray-600 leading-relaxed mb-2">{message}</p>}
          {children}
        </div>
      </div>
    </Modal>
  );
}

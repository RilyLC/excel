import React from 'react';
import Modal from './Modal';
import { AlertTriangle, XCircle, Info, CheckCircle2 } from 'lucide-react';

export default function AlertModal({ isOpen, onClose, title = '提示', message, type = 'error' }) {
  const icons = {
    error: <XCircle className="text-red-500" size={32} />,
    warning: <AlertTriangle className="text-amber-500" size={32} />,
    info: <Info className="text-blue-500" size={32} />,
    success: <CheckCircle2 className="text-green-500" size={32} />
  };

  const btnClasses = {
    error: 'bg-red-600 hover:bg-red-700 focus:ring-red-500',
    warning: 'bg-amber-600 hover:bg-amber-700 focus:ring-amber-500',
    info: 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500',
    success: 'bg-green-600 hover:bg-green-700 focus:ring-green-500'
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <button
          onClick={onClose}
          className={`px-4 py-2 text-sm font-medium text-white border border-transparent rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 shadow-sm transition-colors ${btnClasses[type] || btnClasses.info}`}
        >
          知道了
        </button>
      }
    >
      <div className="flex flex-col items-center text-center">
        <div className="mb-4">
          {icons[type] || icons.info}
        </div>
        <p className="text-gray-700">{message}</p>
      </div>
    </Modal>
  );
}

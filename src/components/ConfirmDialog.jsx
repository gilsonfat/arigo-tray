import React from 'react';
import Modal from './Modal';
import Button from './Button';

/**
 * Diálogo de confirmação para ações como exclusão
 */
const ConfirmDialog = ({
  isOpen,
  title = 'Confirmar',
  message = 'Tem certeza que deseja realizar esta ação?',
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  onConfirm,
  onCancel,
  variant = 'primary' // 'primary', 'danger', 'warning'
}) => {
  const getVariantClass = () => {
    switch (variant) {
      case 'danger':
        return 'bg-red-50 text-red-700 border-red-200';
      case 'warning':
        return 'bg-yellow-50 text-yellow-700 border-yellow-200';
      default:
        return 'bg-blue-50 text-blue-700 border-blue-200';
    }
  };

  const getButtonVariant = () => {
    switch (variant) {
      case 'danger':
        return 'danger';
      case 'warning':
        return 'warning';
      default:
        return 'primary';
    }
  };

  // Função que irá garantir que o clique seja processado corretamente
  const handleConfirm = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (typeof onConfirm === 'function') {
      onConfirm();
    }
  };

  const handleCancel = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (typeof onCancel === 'function') {
      onCancel();
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onCancel}
      title={title}
      footer={false}
      size="sm"
    >
      <div className={`p-4 border rounded ${getVariantClass()} mb-6`}>
        <p>{message}</p>
      </div>
      
      <div className="flex justify-end space-x-3 mt-4">
        <Button
          variant="secondary"
          onClick={handleCancel}
          className="min-w-[6rem]"
        >
          {cancelLabel}
        </Button>
        <Button
          variant={getButtonVariant()}
          onClick={handleConfirm}
          className="min-w-[6rem] font-medium"
        >
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
};

export default ConfirmDialog; 
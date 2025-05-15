import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';

const Modal = ({ 
  isOpen, 
  onClose, 
  title, 
  children, 
  size = 'md',
  showFooter = true,
  noFooter = false,
  footer,
  footerContent,
  preventClose = false 
}) => {
  // Determinar se deve mostrar o footer (considerando ambas as props)
  const shouldShowFooter = noFooter ? false : showFooter;
  // Usar footer ou footerContent (para compatibilidade)
  const finalFooterContent = footer || footerContent;
  
  // Impedir rolagem do body quando modal estiver aberto
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);
  
  // Fechar modal com tecla ESC
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape' && !preventClose) onClose();
    };
    
    if (isOpen) {
      window.addEventListener('keydown', handleEsc);
    }
    
    return () => {
      window.removeEventListener('keydown', handleEsc);
    };
  }, [isOpen, onClose, preventClose]);
  
  // Tamanhos para o modal
  const sizeClasses = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
    full: 'max-w-full mx-4'
  };
  
  // Manipulador para submissão manual do formulário
  const handleFormSubmit = () => {
    console.log('Modal: Tentando submeter o formulário manualmente');
    try {
      const form = document.getElementById('modal-form');
      if (form) {
        console.log('Modal: Formulário encontrado, disparando evento submit');
        form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
      } else {
        console.error('Modal: Formulário não encontrado');
      }
    } catch (err) {
      console.error('Modal: Erro ao submeter formulário:', err);
    }
  };
  
  if (!isOpen) return null;
  
  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget && !preventClose) {
      onClose();
    }
  };
  
  const modal = (
    <div 
      className="fixed inset-0 z-[9999] overflow-y-auto bg-black bg-opacity-50 flex items-center justify-center p-4"
      onClick={handleOverlayClick}
      aria-modal="true"
      role="dialog"
    >
      <div 
        className={`bg-white rounded-lg shadow-xl w-full ${sizeClasses[size]} transform transition-all`}
        onClick={e => e.stopPropagation()} // Prevent closing when clicking inside modal content
      >
        {/* Header */}
        <div className="flex justify-between items-center border-b px-6 py-4">
          <h3 className="text-lg font-medium text-gray-900">{title}</h3>
          {!preventClose && (
            <button
              type="button"
              onClick={onClose}
              className="text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-gray-300"
            >
              <span className="sr-only">Fechar</span>
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
        
        {/* Body */}
        <div className="px-6 py-4 max-h-[70vh] overflow-y-auto">
          {children}
        </div>
        
        {/* Footer */}
        {shouldShowFooter && (
          <div className="border-t px-6 py-4 flex justify-end space-x-3 bg-gray-50 rounded-b-lg">
            {finalFooterContent /* Render custom footer if provided */} 
            {/* Default footer buttons if no custom content */}
            {!finalFooterContent && (
              <>
                <button 
                  type="button" 
                  onClick={onClose}
                  disabled={preventClose}
                  className={`px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-300 ${preventClose ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  Cancelar
                </button>
                <button 
                  type="submit" // Assumes form submission triggers save
                  form="modal-form" // Links to the form inside the modal body
                  disabled={preventClose}
                  className={`px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-300 ${preventClose ? 'opacity-50 cursor-not-allowed' : ''}`}
                  onClick={handleFormSubmit} // Adiciona o manipulador para submissão manual
                >
                  Confirmar
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
  
  // Render the modal into the body using a portal
  return createPortal(modal, document.body);
};

export default Modal; 
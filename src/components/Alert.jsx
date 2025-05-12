import React, { useEffect, useState } from 'react';

const Alert = ({ 
  type = 'info', 
  message, 
  showIcon = true, 
  onClose, 
  autoClose = true,
  autoCloseTime = 5000,
  className = ''
}) => {
  const [isVisible, setIsVisible] = useState(true);

  const handleClose = () => {
    setIsVisible(false);
    if (onClose) {
      // Call onClose after animation (if any) or directly
      setTimeout(onClose, 150); // Adjust timing if using transitions
    }
  };

  useEffect(() => {
    let timer;
    if (autoClose) {
      timer = setTimeout(() => {
        handleClose();
      }, autoCloseTime);
    }
    
    return () => {
      if (timer) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoClose, autoCloseTime]); // Dependencies for auto-close effect
  
  const types = {
    success: {
      bgColor: 'bg-green-50',
      borderColor: 'border-green-400',
      textColor: 'text-green-800',
      iconColor: 'text-green-400',
      icon: (
        <path 
          strokeLinecap="round" 
          strokeLinejoin="round" 
          strokeWidth="2" 
          d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" 
        />
      )
    },
    error: {
      bgColor: 'bg-red-50',
      borderColor: 'border-red-400',
      textColor: 'text-red-800',
      iconColor: 'text-red-400',
      icon: (
        <path 
          strokeLinecap="round" 
          strokeLinejoin="round" 
          strokeWidth="2" 
          d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" 
        />
      )
    },
    warning: {
      bgColor: 'bg-yellow-50',
      borderColor: 'border-yellow-400',
      textColor: 'text-yellow-800',
      iconColor: 'text-yellow-400',
      icon: (
        <path 
          strokeLinecap="round" 
          strokeLinejoin="round" 
          strokeWidth="2" 
          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" 
        />
      )
    },
    info: {
      bgColor: 'bg-blue-50',
      borderColor: 'border-blue-400',
      textColor: 'text-blue-800',
      iconColor: 'text-blue-400',
      icon: (
        <path 
          strokeLinecap="round" 
          strokeLinejoin="round" 
          strokeWidth="2" 
          d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" 
        />
      )
    }
  };
  
  const style = types[type] || types.info; // Fallback to info
  
  if (!isVisible) return null; // Don't render if not visible

  return (
    <div 
      className={`border-l-4 p-4 rounded-r-md transition-opacity duration-150 ease-in-out ${style.bgColor} ${style.borderColor} ${style.textColor} ${className}`}
      role="alert"
    >
      <div className="flex items-start"> {/* Use items-start for better alignment with multiline messages */}
        {showIcon && (
          <div className="flex-shrink-0 mt-0.5"> {/* Added mt-0.5 for slight alignment tweak */}
            <svg 
              className={`h-5 w-5 ${style.iconColor}`} 
              xmlns="http://www.w3.org/2000/svg" 
              viewBox="0 0 20 20" // Adjusted viewBox for common icons
              fill="currentColor"
              aria-hidden="true" // Hide decorative icon from screen readers
            >
              {style.icon}
            </svg>
          </div>
        )}
        <div className="ml-3 flex-1"> {/* Allow message to take remaining space */} 
          <p className="text-sm font-medium">{message}</p>
        </div>
        {onClose && ( // Render close button only if onClose is provided
          <div className="ml-auto pl-3">
            <button
              type="button"
              onClick={handleClose} // Use the internal close handler
              className={`-mx-1.5 -my-1.5 inline-flex h-8 w-8 items-center justify-center rounded-md p-1.5 ${style.textColor} hover:bg-opacity-20 focus:outline-none focus:ring-2 focus:ring-offset-2 ${style.bgColor === 'bg-white' ? `focus:ring-offset-gray-50` : `focus:ring-offset-${style.bgColor.split('-')[1]}-50`} focus:${style.borderColor}`}
              aria-label="Dismiss"
            >
              <span className="sr-only">Fechar</span>
              <svg 
                className="h-5 w-5" 
                xmlns="http://www.w3.org/2000/svg" 
                viewBox="0 0 20 20" 
                fill="currentColor"
                aria-hidden="true"
              >
                <path 
                  fillRule="evenodd" 
                  d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" 
                  clipRule="evenodd" 
                />
              </svg>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default Alert; 
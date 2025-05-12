import React from 'react';

const Button = ({ 
  children, 
  variant = 'primary', 
  size = 'md', 
  type = 'button',
  onClick, 
  disabled,
  className = '',
  isLoading = false,
  leftIcon = null,
  rightIcon = null,
  title = ''
}) => {
  const baseClasses = "font-medium rounded focus:outline-none focus:ring-2 transition duration-150 ease-in-out";
  
  const variants = {
    primary: "bg-blue-600 hover:bg-blue-700 focus:ring-blue-300 text-white",
    secondary: "bg-gray-200 hover:bg-gray-300 focus:ring-gray-200 text-gray-800",
    success: "bg-green-600 hover:bg-green-700 focus:ring-green-300 text-white",
    danger: "bg-red-600 hover:bg-red-700 focus:ring-red-300 text-white",
    warning: "bg-yellow-500 hover:bg-yellow-600 focus:ring-yellow-300 text-white",
    info: "bg-sky-500 hover:bg-sky-600 focus:ring-sky-300 text-white",
    icon: "bg-transparent hover:bg-gray-100 text-gray-700 focus:ring-gray-200",
  };
  
  const sizes = {
    sm: "px-3 py-1.5 text-sm",
    md: "px-4 py-2",
    lg: "px-6 py-2.5 text-lg",
  };
  
  // Ajuste específico para botões com ícones
  const iconOnlyClasses = (!children && (leftIcon || rightIcon)) ? "p-2" : "";
  
  const disabledClasses = "opacity-60 cursor-not-allowed";
  
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || isLoading}
      title={title}
      className={`
        ${baseClasses}
        ${variants[variant] || variants.primary}
        ${sizes[size]}
        ${iconOnlyClasses}
        ${disabled || isLoading ? disabledClasses : ''}
        ${className}
        inline-flex items-center justify-center shadow-sm hover:shadow min-w-[2.5rem]
      `}
    >
      {isLoading ? (
        <>
          <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-current" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          Processando...
        </>
      ) : (
        <>
          {leftIcon && <span className={`mr-2 ${children ? "" : "m-0"}`}>{leftIcon}</span>}
          {children}
          {rightIcon && <span className={`ml-2 ${children ? "" : "m-0"}`}>{rightIcon}</span>}
        </>
      )}
    </button>
  );
};

export default Button; 
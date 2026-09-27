const response = {
  success: (data, message, code) => {
    return {
      data: data,
      message: message,
      code: code,
      status: "success",
    };
  },
  error: (message, code) => {
    return {
      message: message,
      code: code,
      status: "error",
    };
  },
};

module.exports = response;

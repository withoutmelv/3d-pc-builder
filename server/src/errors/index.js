export const errorCodes = {
  VALIDATION_ERROR: [400, '请求参数不合法'],
  PART_NOT_FOUND: [404, '所选配件不存在'],
  BUILD_NOT_FOUND: [404, '配置不存在'],
  ROUTE_NOT_FOUND: [404, '接口不存在'],
  INTERNAL_ERROR: [500, '服务暂时不可用，请稍后重试'],
};
export class AppError extends Error {
  constructor(code, message) {
    super(message || errorCodes[code][1]);
    this.code = code;
  }
}
export function errorHandler(error, request, reply) {
  let code =
    error instanceof AppError
      ? error.code
      : error.statusCode >= 400 && error.statusCode < 500
        ? 'VALIDATION_ERROR'
        : 'INTERNAL_ERROR';
  if (error.validation) code = 'VALIDATION_ERROR';
  if (code === 'INTERNAL_ERROR') request.log.error(error);
  reply.code(errorCodes[code][0]).send({
    code,
    message: error instanceof AppError ? error.message : errorCodes[code][1],
    data: null,
  });
}
export const ok = (data) => ({ code: 'OK', message: '成功', data });

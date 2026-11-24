import * as statsService from './stats.service.js';

export const getStats = async (req, res) => {
  const stats = await statsService.getUserStats({
    userId: req.user._id,
  });

  return res.status(200).json({
    success: true,
    stats,
  });
};

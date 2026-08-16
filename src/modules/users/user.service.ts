import type { Prisma } from '../../generated/prisma/client.js';
import { prisma } from '../../infrastructure/database/prisma.js';
import { AppError } from '../../shared/errors/app-error.js';
import { userSelect, type PublicUser } from './user.types.js';

export const findActiveUserById = async (id: number): Promise<PublicUser> => {
  const user = await prisma.user.findFirst({
    where: { id, deletedAt: null },
    select: userSelect,
  });

  if (!user) throw new AppError(404, 'User not found');
  return user;
};

export const updateActiveUser = async (
  id: number,
  data: Prisma.UserUpdateInput,
): Promise<PublicUser> => {
  await findActiveUserById(id);
  return prisma.user.update({ where: { id }, data, select: userSelect });
};

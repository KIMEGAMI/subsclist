import { prisma } from "@/lib/prisma";

export type SubscriptionRelationIds = {
  categoryId?: string | null;
  paymentMethodId?: string | null;
};

export async function ownsSubscriptionRelations(userId: string, relations: SubscriptionRelationIds) {
  const categoryId = relations.categoryId || null;
  const paymentMethodId = relations.paymentMethodId || null;
  const [category, paymentMethod] = await Promise.all([
    categoryId
      ? prisma.category.findFirst({ where: { id: categoryId, userId }, select: { id: true } })
      : Promise.resolve(null),
    paymentMethodId
      ? prisma.paymentMethod.findFirst({ where: { id: paymentMethodId, userId }, select: { id: true } })
      : Promise.resolve(null),
  ]);

  return (!categoryId || Boolean(category)) && (!paymentMethodId || Boolean(paymentMethod));
}

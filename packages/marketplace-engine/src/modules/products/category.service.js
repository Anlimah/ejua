const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../../utils/db');
const { slugify, uniqueSlug } = require('../../utils/slug');
const { NotFoundError, ValidationError } = require('@ejua/shared');

class CategoryService {
  constructor() {
    this.db = getDb();
  }

  async create(tenantId, data) {
    const { name, description, parent_id, image_url, sort_order } = data;

    if (!name || name.trim().length < 2) {
      throw new ValidationError('Category name must be at least 2 characters', 'name');
    }

    // Validate parent exists if provided
    if (parent_id) {
      const parent = await this.db('categories')
        .where({ id: parent_id, tenant_id: tenantId })
        .first();
      if (!parent) throw new NotFoundError('Parent category', parent_id);
    }

    const baseSlug = slugify(name);
    const slug = await uniqueSlug(this.db, 'categories', baseSlug, tenantId);

    const [category] = await this.db('categories')
      .insert({
        id: uuidv4(),
        tenant_id: tenantId,
        parent_id: parent_id || null,
        name: name.trim(),
        slug,
        description: description || null,
        image_url: image_url || null,
        sort_order: sort_order || 0,
      })
      .returning('*');

    return category;
  }

  async update(categoryId, tenantId, data) {
    const category = await this.db('categories')
      .where({ id: categoryId, tenant_id: tenantId })
      .first();

    if (!category) throw new NotFoundError('Category', categoryId);

    const updates = {};
    if (data.name && data.name !== category.name) {
      updates.name = data.name.trim();
      const baseSlug = slugify(data.name);
      updates.slug = await uniqueSlug(this.db, 'categories', baseSlug, tenantId, categoryId);
    }
    if (data.description !== undefined) updates.description = data.description;
    if (data.image_url !== undefined) updates.image_url = data.image_url;
    if (data.sort_order !== undefined) updates.sort_order = data.sort_order;
    if (data.is_active !== undefined) updates.is_active = data.is_active;
    if (data.parent_id !== undefined) {
      // Prevent circular reference
      if (data.parent_id === categoryId) {
        throw new ValidationError('Category cannot be its own parent', 'parent_id');
      }
      updates.parent_id = data.parent_id;
    }

    if (Object.keys(updates).length === 0) return category;

    const [updated] = await this.db('categories')
      .where({ id: categoryId })
      .update(updates)
      .returning('*');

    return updated;
  }

  async getById(categoryId, tenantId) {
    const category = await this.db('categories')
      .where({ id: categoryId, tenant_id: tenantId })
      .first();
    if (!category) throw new NotFoundError('Category', categoryId);
    return category;
  }

  async getBySlug(slug, tenantId) {
    const category = await this.db('categories')
      .where({ slug, tenant_id: tenantId, is_active: true })
      .first();
    if (!category) throw new NotFoundError('Category', slug);
    return category;
  }

  /**
   * Get the full category tree as a nested structure.
   * Returns top-level categories with children[] arrays.
   */
  async getTree(tenantId) {
    const all = await this.db('categories')
      .where({ tenant_id: tenantId, is_active: true })
      .orderBy('sort_order', 'asc')
      .orderBy('name', 'asc');

    // Build a map for O(n) tree construction
    const map = new Map();
    const roots = [];

    for (const cat of all) {
      map.set(cat.id, { ...cat, children: [] });
    }

    for (const cat of all) {
      const node = map.get(cat.id);
      if (cat.parent_id && map.has(cat.parent_id)) {
        map.get(cat.parent_id).children.push(node);
      } else {
        roots.push(node);
      }
    }

    return roots;
  }

  /**
   * Get flat list of all categories (for dropdowns, filters).
   */
  async list(tenantId, activeOnly = true) {
    const query = this.db('categories').where({ tenant_id: tenantId });
    if (activeOnly) query.where('is_active', true);
    return query.orderBy('sort_order', 'asc').orderBy('name', 'asc');
  }

  async delete(categoryId, tenantId) {
    const category = await this.db('categories')
      .where({ id: categoryId, tenant_id: tenantId })
      .first();
    if (!category) throw new NotFoundError('Category', categoryId);

    // Check for child categories
    const children = await this.db('categories')
      .where({ parent_id: categoryId })
      .count('id as count')
      .first();

    if (parseInt(children.count) > 0) {
      throw new ValidationError('Cannot delete category with subcategories. Remove children first.', 'parent_id');
    }

    // Check for products in this category
    const products = await this.db('products')
      .where({ category_id: categoryId, is_active: true })
      .count('id as count')
      .first();

    if (parseInt(products.count) > 0) {
      throw new ValidationError('Cannot delete category with active products. Reassign products first.', 'category_id');
    }

    // Soft delete
    await this.db('categories')
      .where({ id: categoryId })
      .update({ is_active: false });

    return { deleted: true };
  }
}

module.exports = new CategoryService();

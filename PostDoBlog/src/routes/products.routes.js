const express = require('express');
const router = express.Router();
const productsController = require('../controllers/products.controller');

// Product routes
router.post('/', productsController.createProduct);
router.get('/', productsController.getAllProducts);
router.get('/job/:job_id', productsController.getProductsByJobId);
router.get('/:id', productsController.getProductById);
router.put('/:id', productsController.updateProduct);
router.delete('/:id', productsController.deleteProduct);

module.exports = router;
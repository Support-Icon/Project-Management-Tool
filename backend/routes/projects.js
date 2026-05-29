const express = require('express');
const Project = require('../models/Project');
const Task = require('../models/Task');
const { auth, adminOnly } = require('../middleware/auth');
const { getInvolvedProjectIds, userCanAccessProject, isMineOnlyRequest } = require('../utils/taskAccess');

const router = express.Router();

// Get all projects (admin: all company projects; member: only projects they are assigned to)
router.get('/', auth, async (req, res) => {
  try {
    const companyId = req.user.company._id;
    const filter = { company: companyId };

    if (req.user.role !== 'admin' || isMineOnlyRequest(req.query.mineOnly)) {
      const involvedIds = await getInvolvedProjectIds(req.user, companyId);
      filter._id = { $in: involvedIds };
    }

    const projects = await Project.find(filter)
      .populate('createdBy', 'username')
      .sort({ createdAt: -1 });
    res.json(projects);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get single project
router.get('/:id', auth, async (req, res) => {
  try {
    const project = await Project.findOne({
      _id: req.params.id,
      company: req.user.company._id,
    }).populate('createdBy', 'username');

    if (!project) return res.status(404).json({ message: 'Project not found' });

    if (!(await userCanAccessProject(req.user, project._id))) {
      return res.status(403).json({ message: 'You do not have access to this project' });
    }

    res.json(project);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Create project (admin only)
router.post('/', auth, adminOnly, async (req, res) => {
  try {
    const { title, description } = req.body;
    if (!title) return res.status(400).json({ message: 'Title is required' });

    const project = await Project.create({
      title: title.trim(),
      description: description?.trim() || '',
      company: req.user.company._id,
      createdBy: req.user._id
    });

    const populated = await Project.findById(project._id).populate('createdBy', 'username');
    res.status(201).json(populated);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Update project (admin only)
router.put('/:id', auth, adminOnly, async (req, res) => {
  try {
    const { title, description, columns } = req.body;
    const updates = {};

    if (title) updates.title = title.trim();
    if (description !== undefined) updates.description = description.trim();
    if (columns) updates.columns = columns;

    const project = await Project.findOneAndUpdate(
      { _id: req.params.id, company: req.user.company._id },
      updates,
      { new: true }
    ).populate('createdBy', 'username');

    if (!project) return res.status(404).json({ message: 'Project not found' });
    res.json(project);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Delete project (admin only)
router.delete('/:id', auth, adminOnly, async (req, res) => {
  try {
    const project = await Project.findOneAndDelete({
      _id: req.params.id,
      company: req.user.company._id
    });

    if (!project) return res.status(404).json({ message: 'Project not found' });

    await Task.deleteMany({ project: req.params.id });

    res.json({ message: 'Project deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;

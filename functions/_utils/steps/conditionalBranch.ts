export function executeConditionalBranch(config: any, context: any) {
  const condition = config.condition; // e.g. "context.step_1.includes('yes')"
  
  if (!condition) {
    return { success: false, error: 'Condition is required for conditional_branch step' };
  }

  try {
    // Create a safe environment function
    const evaluator = new Function('context', `return ${condition};`);
    
    const result = evaluator(context);

    return {
      success: true,
      result: {
        evaluated: !!result
      }
    };
  } catch (error: any) {
    console.error("Conditional Branch Error:", error);
    return {
      success: false,
      error: error.message
    };
  }
}
